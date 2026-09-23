import type { Server } from "node:http";
import type { Socket } from "node:net";

export function trackFixtureSockets(server: Server): Set<Socket> {
  const sockets = new Set<Socket>();
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  return sockets;
}

// Bun 1.3.14 sometimes never invokes server.close's callback even after the
// listener and every connection have closed, so wait for that observable state.
export async function closeFixtureServer(server: Server, sockets: Set<Socket>, timeoutMs = 5_000): Promise<void> {
  let closeError: Error | undefined;
  server.close((error) => {
    closeError = error;
  });
  for (const socket of sockets) socket.destroy();
  const deadline = performance.now() + timeoutMs;
  while (server.listening || sockets.size > 0) {
    if (closeError) throw closeError;
    if (performance.now() > deadline) {
      throw new Error(`Fixture server did not close within ${timeoutMs}ms (listening=${server.listening}, sockets=${sockets.size})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  // Let an immediate close error (for example, a server that never listened) arrive.
  await new Promise((resolve) => setImmediate(resolve));
  if (closeError) throw closeError;
}
