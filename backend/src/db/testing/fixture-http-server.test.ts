import { describe, expect, test } from "bun:test";
import { createServer, request, type Server } from "node:http";
import { closeFixtureServer, trackFixtureSockets } from "./fixture-http-server";

async function listeningServer() {
  const server = createServer((_req, res) => res.end("ok"));
  const sockets = trackFixtureSockets(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, sockets };
}

async function keepAliveRequests(server: Server, count: number) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port");
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve, reject) => {
      const outgoing = request({ host: "127.0.0.1", port: address.port, path: "/", headers: { connection: "keep-alive" } }, (response) => {
        response.resume();
        response.on("end", resolve);
      });
      outgoing.on("error", reject);
      outgoing.end();
    });
  }
}

describe("closeFixtureServer", () => {
  test("closes the listener and every idle keep-alive connection", async () => {
    const { server, sockets } = await listeningServer();
    await keepAliveRequests(server, 3);
    expect(sockets.size).toBeGreaterThan(0);
    await closeFixtureServer(server, sockets);
    expect(server.listening).toBe(false);
    expect(sockets.size).toBe(0);
  });

  test("returns once the server is closed even if the close callback never fires", async () => {
    const { server, sockets } = await listeningServer();
    await keepAliveRequests(server, 2);
    const close = server.close.bind(server);
    // Reproduce the Bun behaviour: the server closes but the callback is dropped.
    server.close = (() => close()) as Server["close"];
    const callbackOnly = new Promise<void>((resolve) => server.close(() => resolve()));
    const outcome = await Promise.race([callbackOnly.then(() => "closed"), Bun.sleep(200).then(() => "still waiting")]);
    expect(outcome).toBe("still waiting");
    await closeFixtureServer(server, sockets);
    expect(server.listening).toBe(false);
    expect(sockets.size).toBe(0);
  });

  test("fails within its bound when the server keeps listening", async () => {
    const { server, sockets } = await listeningServer();
    const close = server.close.bind(server);
    server.close = (() => server) as Server["close"];
    try {
      const started = performance.now();
      await expect(closeFixtureServer(server, sockets, 50)).rejects.toThrow("Fixture server did not close within 50ms (listening=true");
      expect(performance.now() - started).toBeLessThan(1_000);
    } finally {
      close();
    }
  });

  test("reports a close error instead of succeeding silently", async () => {
    const server = createServer();
    const sockets = trackFixtureSockets(server);
    await expect(closeFixtureServer(server, sockets)).rejects.toThrow();
  });
});
