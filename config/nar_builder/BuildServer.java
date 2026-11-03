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
        // What a previous run left -- killed mid-build, or restarted -- goes
        // before the first build rather than with it. B7-9.
        for (String user : SLOT_USERS) {
            String atStart = sweep(user);
            if (atStart != null) {
                System.out.println("sweep of " + user + " at start: " + atStart);
            }
        }
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

    /**
     * Two at a time, as before -- but a third is told so rather than waiting, and
     * each slot is its own unprivileged user.
     *
     * Both slots ran as one uid against 755 work directories, so a running build
     * could write into the other's repository. Each user here is created by the
     * Dockerfile with a root-owned, read-only home; B7-6 holds that the two lists
     * agree. FR42, #31.
     */
    private static final List<String> SLOT_USERS = List.of("builder", "builder2");
    private static final java.util.concurrent.BlockingQueue<String> SLOTS =
            new java.util.concurrent.LinkedBlockingQueue<>(SLOT_USERS);

    /**
     * Everything a slot user can write outside its work directory, which is
     * under /tmp and so swept with it. Computed in the image as each user --
     * `find / -xdev -writable` and the tmpfs mounts -- and held there by B7-9
     * rather than by this comment. `/m2` is not here: entrypoint.sh keeps it
     * because B6-36 and B6-38 still drive its handling there, and no build reads
     * it, since each has its own repository. FR42.
     */
    private static final List<String> SWEPT =
            List.of("/tmp", "/var/tmp", "/run/lock", "/dev/shm", "/dev/mqueue");

    private static void invoke(HttpExchange exchange, List<String> command) throws IOException {
        String user = SLOTS.poll();
        if (user == null) {
            respond(exchange, 503, "nar-build refused: two builds are already running.\n"
                    + "Wait for one to finish and run it again.\n");
            return;
        }
        try {
            // Before as well as after: a server that died mid-build never ran
            // the sweep after it, and a sweep that failed then is retried here.
            String fault = sweep(user);
            if (fault != null) {
                respond(exchange, 500, "nar-build refused: the builder could not clear what an earlier"
                        + " build left behind as " + user + " (" + fault + "),\n"
                        + "so this build did not start. Ask the operator to recreate the builder:\n"
                        + "docker compose up -d --force-recreate nar_builder\n");
                return;
            }
            invokeHeld(exchange, command, user);
        } finally {
            // Nested, so a sweep that throws does not take the slot with it. FR42.
            try {
                String after = sweep(user);
                if (after != null) {
                    System.out.println("sweep of " + user + " after a build: " + after);
                }
            } finally {
                SLOTS.add(user);
            }
        }
    }

    /**
     * End every process the slot user runs and remove every file it owns where
     * it can write, so nothing one build leaves is there for the next on that
     * slot. Returns null when the slot is clean, or what stayed.
     *
     * A `nohup` started by build-time code was measured to survive `mvn`'s
     * exit, and endBuildTree reaches only what descends from the build. So the
     * user's processes are ended by a `kill -KILL -1` sent as that user, which
     * reaches every one of them and nothing of root's or the other slot's, and
     * which a process forking successors cannot outrun the way a list can.
     * Sent once whatever the scan says, and repeated while a live task remains,
     * five times in all: a kill sent only on what the scan saw spared a process
     * the scan could not read.
     *
     * Tasks, not processes: a process whose main thread has exited shows `Z` in
     * /proc/<pid>/stat while its other threads run, and the sweep that skipped it
     * let one write the next build's `.mavenrc`. A **zombie** -- every task `Z`
     * -- is not counted: this server is PID 1 and reaps nothing it did not
     * start, so a process orphaned by the kill stays one. Waiting on it would
     * lose the slot for good. /proc is read as bytes, since a task names itself
     * and a strict UTF-8 read threw on `\xff\xfe\xfd`; a task counts as gone only
     * when its files are, and one that cannot be read counts as live.
     *
     * A file is removed with whatever it holds (`-prune` and `rm -rf`), because
     * build.sh writes root-owned files into the user's work directory, and the
     * result is checked rather than the exit status: a concurrent build removing
     * its own work directory mid-walk is not a failure of this one. `-execdir`,
     * not `-exec`: `rm` gets `./<name>` in the directory find holds, so the other
     * slot's build cannot swap a symlink into a path root resolves again. B7-9.
     */
    static String sweep(String user) {
        long[] ids = ids(user);
        if (ids == null) {
            return "no user " + user + " with a uid other than root's";
        }
        long left = -1;
        for (int round = 0; round < 5 && (round == 0 || left >= 0); round++) {
            run(List.of("setpriv", "--reuid=" + ids[0], "--regid=" + ids[1], "--clear-groups",
                    "sh", "-c", "kill -KILL -1"));
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            left = liveTask(ids[0]);
            if (Thread.currentThread().isInterrupted()) {
                break;
            }
        }
        if (left >= 0) {
            return "a process would not end, pid " + left;
        }
        List<String> dirs = SWEPT.stream()
                .filter(d -> java.nio.file.Files.isDirectory(java.nio.file.Path.of(d)))
                .collect(java.util.stream.Collectors.toList());
        if (dirs.isEmpty()) {
            return null;
        }
        List<String> remove = new ArrayList<>(List.of("find"));
        remove.addAll(dirs);
        remove.addAll(List.of("-ignore_readdir_race", "-mindepth", "1", "-user", user,
                "-prune", "-execdir", "rm", "-rf", "{}", "+"));
        run(remove);
        List<String> check = new ArrayList<>(List.of("find"));
        check.addAll(dirs);
        check.addAll(List.of("-ignore_readdir_race", "-mindepth", "1", "-user", user, "-print", "-quit"));
        String stayed = run(check).trim();
        return stayed.isEmpty() ? null : stayed + " could not be removed";
    }

    /**
     * Uid and gid from /etc/passwd; null for no such user, or for root's uid.
     * Compared as a number: `00` is root to the kernel, and `kill -1` as root
     * would end everything in the container but this server.
     */
    private static long[] ids(String user) {
        try {
            for (String line : java.nio.file.Files.readAllLines(java.nio.file.Path.of("/etc/passwd"))) {
                String[] f = line.split(":");
                if (f.length > 3 && f[0].equals(user) && f[2].matches("[0-9]{1,10}") && f[3].matches("[0-9]{1,10}")
                        && Long.parseLong(f[2]) != 0) {
                    return new long[] {Long.parseLong(f[2]), Long.parseLong(f[3])};
                }
            }
        } catch (IOException e) {
            return null;
        }
        return null;
    }

    /**
     * The real uid in a /proc status file, or -1. Split on `\n` alone: a task
     * names itself, and a name holding 0x85 is a line break to a multi-line `^`.
     */
    private static long realUid(String status) {
        for (String line : status.split("\n")) {
            if (line.startsWith("Uid:\t")) {
                return Long.parseLong(line.split("\t")[1]);
            }
        }
        return -1;
    }

    /**
     * The pid of a task whose real uid is the given one and whose state is not
     * Z, or -1 for none. A task whose files have gone since it was listed is not
     * live; one whose files are there and cannot be read is, of whatever uid.
     */
    private static long liveTask(long uid) {
        java.io.File[] procs = new java.io.File("/proc").listFiles((d, n) -> n.matches("[0-9]+"));
        for (java.io.File proc : procs == null ? new java.io.File[0] : procs) {
            java.io.File[] tasks = new java.io.File(proc, "task").listFiles();
            for (java.io.File task : tasks == null ? new java.io.File[0] : tasks) {
                java.nio.file.Path status = task.toPath().resolve("status");
                try {
                    if (realUid(procText(status)) == uid && state(task.toPath().resolve("stat")) != 'Z') {
                        return Long.parseLong(proc.getName());
                    }
                } catch (IOException e) {
                    if (java.nio.file.Files.exists(status)) {
                        return Long.parseLong(proc.getName());
                    }
                }
            }
        }
        return -1;
    }

    /** The state in a /proc stat file; Z for one that has gone, `?` for one that cannot be read. */
    private static char state(java.nio.file.Path stat) {
        try {
            String text = procText(stat);
            int close = text.lastIndexOf(')');
            return close < 0 || text.length() < close + 3 ? '?' : text.charAt(close + 2);
        } catch (IOException e) {
            return java.nio.file.Files.exists(stat) ? '?' : 'Z';
        }
    }

    /** A /proc file as bytes, one char each, so no task name can make it unreadable. */
    private static String procText(java.nio.file.Path file) throws IOException {
        return new String(java.nio.file.Files.readAllBytes(file), StandardCharsets.ISO_8859_1);
    }

    private static String run(List<String> command) {
        try {
            ProcessBuilder pb = new ProcessBuilder(command).redirectError(ProcessBuilder.Redirect.DISCARD);
            // Absolute only: GNU find refuses -execdir under a PATH with a relative entry.
            pb.environment().put("PATH", "/usr/sbin:/usr/bin:/sbin:/bin");
            Process p = pb.start();
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            p.waitFor();
            return out;
        } catch (IOException e) {
            return command.get(0) + " could not run: " + e.getMessage();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "interrupted";
        }
    }

    private static void invokeHeld(HttpExchange exchange, List<String> command, String user) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(new ArrayList<>(command));
        pb.redirectErrorStream(true);
        pb.environment().put("NAR_BUILDER_BUILD_USER", user);
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
     * /tmp/tmp.XXXX was left behind. The build's slot was handed back with the
     * 504, so the two-at-a-time cap did not hold either -- four concurrent Maven
     * runs were measured under what was then a two-slot semaphore. S2 of the 2026-10-01 review.
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
