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
            String source = body(exchange).trim();
            invoke(exchange, List.of(SCRIPT, "build", source));
        });
        server.setExecutor(Executors.newFixedThreadPool(2));
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

    private static void invoke(HttpExchange exchange, List<String> command) throws IOException {
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
        byte[] output;
        try (InputStream in = process.getInputStream()) {
            output = in.readAllBytes();
        }
        int code;
        try {
            code = process.waitFor();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            respond(exchange, 500, "nar-build refused: the build was interrupted before it finished.\n"
                    + "Run nar-build again; if it keeps happening ask the operator to restart the builder:\n"
                    + "docker compose restart nar_builder\n");
            return;
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

    private static String body(HttpExchange exchange) throws IOException {
        try (InputStream in = exchange.getRequestBody()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
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
}
