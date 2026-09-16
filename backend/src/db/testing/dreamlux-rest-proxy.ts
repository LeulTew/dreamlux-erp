import { createServer, request as httpRequest } from "node:http";

export async function startDreamluxRestProxy() {
  let unexpectedCalls = 0;
  let dropNextRunReply = false;
  let droppedRunReplies = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1:54335");
    if (!url.pathname.startsWith("/rest/v1/")) {
      unexpectedCalls += 1;
      console.error("Unexpected non-REST call to the DreamLux native proxy");
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Native QA does not provide that service" }));
      return;
    }
    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: 54334,
      path: `${url.pathname.slice("/rest/v1".length)}${url.search}`,
      method: request.method,
      headers: { ...request.headers, host: "127.0.0.1:54334" },
    }, (result) => {
      if (dropNextRunReply && request.method === "POST" && url.pathname === "/rest/v1/payroll_runs" && result.statusCode === 201) {
        dropNextRunReply = false;
        droppedRunReplies += 1;
        result.resume();
        result.once("end", () => response.destroy());
        return;
      }
      response.writeHead(result.statusCode ?? 502, result.headers);
      result.pipe(response);
    });
    upstream.on("error", (error) => {
      console.error("DreamLux native REST upstream failed", error.message);
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Native REST fixture unavailable" }));
    });
    request.once("aborted", () => upstream.destroy());
    request.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(54335, "127.0.0.1", resolve);
  });
  return {
    dropNextRunAcknowledgement() {
      dropNextRunReply = true;
      droppedRunReplies = 0;
    },
    clearLostAcknowledgement() {
      dropNextRunReply = false;
      return droppedRunReplies;
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (unexpectedCalls) throw new Error(`Native QA received ${unexpectedCalls} unexpected non-REST calls`);
    },
  };
}
