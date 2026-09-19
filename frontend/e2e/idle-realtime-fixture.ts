import type { BrowserContext, Page } from "@playwright/test";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function mockIdleRealtime(target: BrowserContext | Page, applicationOrigin: string, unexpected: string[]) {
  await target.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.origin === applicationOrigin.replace("http:", "ws:") && url.pathname === "/_next/webpack-hmr") {
      socket.connectToServer();
      return;
    }
    if (url.origin !== "ws://127.0.0.1:54335" || url.pathname !== "/realtime/v1/websocket") {
      unexpected.push("Unconfigured WebSocket");
      void socket.close();
      return;
    }
    socket.onMessage((message) => {
      const parsed: unknown = JSON.parse(message.toString());
      if (!Array.isArray(parsed) || parsed.length !== 5) throw new Error("Unexpected synthetic realtime envelope");
      const [joinRef, ref, topic, event, payload] = parsed;
      if (!["phx_join", "phx_leave", "heartbeat", "access_token"].includes(event)) {
        unexpected.push("Unconfigured realtime event");
        return;
      }
      const changes = record(payload) && record(payload.config) && Array.isArray(payload.config.postgres_changes)
        ? payload.config.postgres_changes : [];
      const response = event === "phx_join" ? { postgres_changes: changes.map((change: unknown, id: number) => {
        if (!record(change)) throw new Error("Malformed synthetic realtime subscription");
        return { ...change, id };
      }) } : {};
      socket.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response }]));
    });
  });
}
