import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public class BuildServer {

    private static final String SCRIPT = "/opt/builder/build.sh";
    private static final Pattern HOSTNAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,62}");
    private static final Pattern VERSION = Pattern.compile("[0-9A-Za-z][0-9A-Za-z._-]{0,31}");
    private static final String AGENT_HEADER = "X-Liquid-Agent";
    private static final long BUILD_TIMEOUT_SECONDS =
            Long.parseLong(System.getenv().getOrDefault("NAR_BUILDER_BUILD_TIMEOUT", "1500"));
    /** The two headers below reach into the build, so they are for tests only. */
    private static final boolean TEST_HOOKS = "1".equals(System.getenv("NAR_BUILDER_TEST_HOOKS"));

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("NAR_BUILDER_PORT", "8770"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/health", exchange -> respond(exchange, 200, "ok\n"));
        server.createContext("/target", exchange -> {
            if (!fromAnAgent(exchange)) {
                return;
            }
            invoke(exchange, List.of(SCRIPT, "target"));
        });
        server.createContext("/build", exchange -> {
            if (!fromAnAgent(exchange)) {
                return;
            }
            if (!"POST".equals(exchange.getRequestMethod())) {
                respond(exchange, 405, "nar-build refused: /build takes a POST.\n");
                return;
            }
            String source = body(exchange);
            if (source == null) {
                respond(exchange, 400, "nar-build refused: the path in the request body is longer than "
                        + MAX_BODY + " bytes or carries a NUL, so it cannot name a directory.\n");
                return;
            }
            invoke(exchange, List.of(SCRIPT, "build", source.trim()));
        });
        // A thread is always free, and the *builds* are what is capped. On a
        // fixed pool of two, two builds in flight blocked the healthcheck --
        // and a cold first build takes minutes, past its 5s timeout, so the
        // container went unhealthy while working exactly as intended. A third
        // request queued with nothing said. Item 9 of the 2026-09-28 review.
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        System.out.println("nar-builder listening on " + port);
    }

    /**
     * A build deploys code into Liquid, so the caller has to be one of this
     * stack's agents rather than any page the operator happens to have open.
     *
     * A text/plain POST is a "simple request": no CORS preflight, so a browser
     * sends it cross-origin without asking. Requiring a header a browser cannot
     * add without a preflight the server never answers is what shuts that door,
     * and a request carrying Origin is a browser request by definition.
     * Blocker 6 of the 2026-09-28 review.
     */
    private static boolean fromAnAgent(HttpExchange exchange) throws IOException {
        if (exchange.getRequestHeaders().getFirst("Origin") != null) {
            respond(exchange, 403, "nar-build refused: this endpoint is for the stack's agents,"
                    + " not for a browser.\n");
            return false;
        }
        if (exchange.getRequestHeaders().getFirst(AGENT_HEADER) == null) {
            respond(exchange, 403, "nar-build refused: the request did not come from nar-build.\n"
                    + "If you are calling it by hand, send " + AGENT_HEADER + ": 1.\n");
            return false;
        }
        return true;
    }

    /** Two at a time, as before -- but a third is told so rather than waiting. */
    private static final java.util.concurrent.Semaphore SLOTS =
            new java.util.concurrent.Semaphore(2);

    private static void invoke(HttpExchange exchange, List<String> command) throws IOException {
        if (!SLOTS.tryAcquire()) {
            respond(exchange, 503, "nar-build refused: two builds are already running.\n"
                    + "Wait for one to finish and run it again.\n");
            return;
        }
        try {
            invokeHeld(exchange, command);
        } finally {
            SLOTS.release();
        }
    }

    private static void invokeHeld(HttpExchange exchange, List<String> command) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(new ArrayList<>(command));
        pb.redirectErrorStream(true);
        String liquid = TEST_HOOKS ? exchange.getRequestHeaders().getFirst("X-Liquid-Host") : null;
        if (liquid != null && HOSTNAME.matcher(liquid).matches()) {
            pb.environment().put("NAR_BUILD_LIQUID_HOST", liquid);
        }
        String probe = TEST_HOOKS ? exchange.getRequestHeaders().getFirst("X-Nifi-Api-Probe-Version") : null;
        if (probe != null && VERSION.matcher(probe).matches()) {
            pb.environment().put("NAR_BUILD_API_PROBE_VERSION", probe);
        }
        Process process = pb.start();
        // Read on another thread. Reading here first was the reason the bound
        // below could never fire: readAllBytes returns only when every writer
        // has closed the pipe, and a killed build can leave a grandchild
        // holding it -- so the request blocked for good with a timeout sitting
        // uselessly underneath it. Found by the case for item 8 on its first
        // run, which hung.
        java.util.concurrent.CompletableFuture<byte[]> reader =
                java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                    try (InputStream in = process.getInputStream()) {
                        return in.readAllBytes();
                    } catch (IOException e) {
                        return new byte[0];
                    }
                });
        int code;
        try {
            // Bounded. Nothing killed a build, so when the client and nginx gave
            // up together at 1800s the build carried on and could still place a
            // NAR in the live drop directory, while the operator had been told
            // the builder was not answering. A hung test held one of two worker
            // threads for good. Item 8 of the 2026-09-28 review.
            if (!process.waitFor(BUILD_TIMEOUT_SECONDS, java.util.concurrent.TimeUnit.SECONDS)) {
                endBuildTree(process);
                respond(exchange, 504, "nar-build refused: the build passed "
                        + BUILD_TIMEOUT_SECONDS + "s and was stopped, so nothing was deployed.\n"
                        + "Run it again, or ask the operator to look at what it is waiting for.\n");
                return;
            }
            code = process.exitValue();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            endBuildTree(process);
            respond(exchange, 500, "nar-build refused: the build was interrupted before it finished.\n"
                    + "Run nar-build again; if it keeps happening ask the operator to restart the builder:\n"
                    + "docker compose restart nar_builder\n");
            return;
        }
        byte[] output;
        try {
            output = reader.get(30, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            output = new byte[0];
        }
        respond(exchange, status(code), new String(output, StandardCharsets.UTF_8));
    }

    private static int status(int code) {
        return switch (code) {
            case 0 -> 200;
            case 2 -> 422;
            case 3 -> 409;
            case 4 -> 400;
            default -> 500;
        };
    }

    /** The argv limit is about 128KB and a NUL cannot cross it at all, so a body
     *  that breaks either makes ProcessBuilder.start() throw -- and nothing was
     *  logged, the connection simply closed, and the client reported that the
     *  builder was not running. Item 13 of the 2026-09-28 review. */
    private static final int MAX_BODY = 8192;

    private static String body(HttpExchange exchange) throws IOException {
        try (InputStream in = exchange.getRequestBody()) {
            byte[] raw = in.readNBytes(MAX_BODY + 1);
            if (raw.length > MAX_BODY) {
                return null;
            }
            String text = new String(raw, StandardCharsets.UTF_8);
            return text.indexOf('\0') >= 0 ? null : text;
        }
    }

    private static void respond(HttpExchange exchange, int status, String text) throws IOException {
        byte[] payload = text.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(status, payload.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(payload);
        }
    }
    /**
     * End the build and everything it started.
     *
     * `destroyForcibly()` on the Process reaches the shell alone. Measured with
     * NAR_BUILDER_BUILD_TIMEOUT=3 and a stub mvn sleeping: the client got 504
     * while `su`, the stub and its `sleep` were still running with PPID 1, and
     * /tmp/tmp.XXXX was left behind. The semaphore slot was released with the
     * 504, so the two-at-a-time cap did not hold either -- four concurrent Maven
     * runs were measured under a two-slot semaphore. S2 of the 2026-10-01 review.
     *
     * The descendants are collected **before** the parent dies: once the shell is
     * gone the tree is gone with it and `descendants()` comes back empty. Order
     * is the whole of this method.
     *
     * TERM first and KILL only after a grace, because build.sh has a TERM trap
     * that removes its work directory (build.sh's `trap ... TERM`). Going
     * straight to destroyForcibly stops everything and still leaves /tmp/tmp.XXXX
     * behind, which is the minor this repair also closes.
     *
     * Not a process-group kill: `su` has already moved Maven into a session of
     * its own -- measured, su is pgid 1 / sid 1 while its child is its own pgid
     * and sid -- so killing the group would miss exactly the process that is
     * still building.
     */
    private static void endBuildTree(Process process) {
        java.util.List<ProcessHandle> kin = process.toHandle().descendants()
                .collect(java.util.stream.Collectors.toList());
        kin.forEach(ProcessHandle::destroy);
        process.destroy();
        try {
            if (!process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) {
                kin.forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            kin.forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
        }
    }

}
