"use strict";

module.exports = function installPayrollUiGuard(serve, serverPorts = [3126, 5326, 54335]) {
  if (!Array.isArray(serverPorts) || serverPorts.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("UI guards require explicit valid loopback ports");
  }
  const http = require("node:http");
  const https = require("node:https");
  const { AsyncLocalStorage } = require("node:async_hooks");
  const net = require("node:net");
  const tls = require("node:tls");
  const originalConnect = net.Socket.prototype.connect;
  const originalTls = tls.connect;
  const originalFetch = globalThis.fetch;
  const allowedPorts = new Set(serve ? serverPorts : []);
  const fonts = new Set(serve ? [] : ["fonts.googleapis.com", "fonts.gstatic.com"]);
  const approvedRequest = new AsyncLocalStorage();
  const sockets = new WeakSet();

  function deny(kind) {
    const message = `[payroll-qa-egress] blocked ${kind}`;
    process.stderr.write(`${message}\n`);
    throw new Error(message);
  }

  function approve(input, init, protocol = "http:") {
    let url;
    if (typeof input === "string" || input instanceof URL) url = new URL(input);
    else if (input instanceof Request) url = new URL(input.url);
    else {
      const host = input?.hostname ?? input?.host ?? "localhost";
      url = new URL(`${input?.protocol ?? protocol}//${host}${input?.port ? `:${input.port}` : ""}`);
    }
    const method = (init?.method ?? input?.method ?? "GET").toUpperCase();
    if (url.username || url.password) return deny("URL credentials");
    const local = url.protocol === "http:" && url.hostname === "127.0.0.1" && allowedPorts.has(Number(url.port));
    const font = url.protocol === "https:" && fonts.has(url.hostname) && method === "GET" && (!url.port || url.port === "443");
    if (!local && !font) return deny("HTTP destination");
    return { host: url.hostname, port: Number(url.port || (font ? 443 : 80)), tls: font };
  }

  for (const transport of [http, https]) {
    for (const method of ["request", "get"]) {
      const original = transport[method];
      transport[method] = function (...args) {
        const target = approve(args[0], args[1], transport === https ? "https:" : "http:");
        return approvedRequest.run(target, () => Reflect.apply(original, this, args));
      };
    }
  }
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const options = first && typeof first === "object" ? first
      : { port: first, host: typeof args[1] === "string" ? args[1] : "localhost" };
    const target = approvedRequest.getStore();
    if (!target || options.path || options.host !== target.host || Number(options.port) !== target.port) return deny("TCP connection");
    sockets.add(this);
    return Reflect.apply(originalConnect, this, args);
  };
  tls.connect = function (...args) {
    const options = args[0];
    const target = approvedRequest.getStore();
    if (!target?.tls || !options || typeof options !== "object"
        || !(sockets.has(options.socket) || (options.host === target.host && Number(options.port) === target.port))) return deny("TLS connection");
    const socket = Reflect.apply(originalTls, this, args);
    sockets.add(socket);
    return socket;
  };
  if (originalFetch) {
    globalThis.fetch = (input, init) => {
      const target = approve(input, init);
      return approvedRequest.run(target, () => originalFetch(input, { ...init, redirect: "error" }));
    };
    globalThis.fetch.preconnect = () => deny("fetch preconnect");
  }
  if (globalThis.WebSocket) globalThis.WebSocket = new Proxy(globalThis.WebSocket, { construct: () => deny("WebSocket") });
};
