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

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("NAR_BUILDER_PORT", "8770"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/health", exchange -> respond(exchange, 200, "ok\n"));
        server.createContext("/target", exchange -> invoke(exchange, List.of(SCRIPT, "target")));
        server.createContext("/build", exchange -> {
            String source = body(exchange).trim();
            invoke(exchange, List.of(SCRIPT, "build", source));
        });
        server.setExecutor(Executors.newFixedThreadPool(2));
        server.start();
        System.out.println("nar-builder listening on " + port);
    }

    private static void invoke(HttpExchange exchange, List<String> command) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(new ArrayList<>(command));
        pb.redirectErrorStream(true);
        String liquid = exchange.getRequestHeaders().getFirst("X-Liquid-Host");
        if (liquid != null && HOSTNAME.matcher(liquid).matches()) {
            pb.environment().put("NAR_BUILD_LIQUID_HOST", liquid);
        }
        String probe = exchange.getRequestHeaders().getFirst("X-Nifi-Api-Probe-Version");
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
