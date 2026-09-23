import { describe, expect, spyOn, test } from "bun:test";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { Readable } from "node:stream";
import type { Request, RequestHandler, Response } from "express";
import multer from "multer";
import { assetUpload, boundedMultipart, employeeUpload, parseEmployeeEventPrices, workbookUpload } from "./multipart";

const MiB = 1024 * 1024;
const boundary = "dreamlux-287-synthetic-boundary";
const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const scalarEmployeeFields: [string, string][] = [
  ["full_name", "Synthetic employee"],
  ["employee_id", "TEST-287"],
  ["department_id", "28700000-0000-4000-8000-000000000001"],
  ["phone", "0912345678"],
  ["email", "upload@example.invalid"],
  ["commission", "10"],
  ["commission_type", "percent"],
  ["salary_level", "L1"],
  ["compensation_mode", "regular"],
  ["office_id", "28700000-0000-4000-8000-000000000002"],
  ["clone_from_id", "28700000-0000-4000-8000-000000000003"],
];

function field(name: string, value: string): Buffer {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
}

function file(name: string, data = image, mime = "image/jpeg", filename = "synthetic.jpg"): Buffer[] {
  return [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    data,
    Buffer.from("\r\n"),
  ];
}

const end = Buffer.from(`--${boundary}--\r\n`);

function* padding(bytes: number): Generator<Buffer> {
  const chunk = Buffer.alloc(Math.min(64 * 1024, bytes), 32);
  for (let left = bytes; left > 0; left -= chunk.length) {
    yield left < chunk.length ? chunk.subarray(0, left) : chunk;
  }
}

interface Outcome {
  req: Request;
  res: Response;
  error?: unknown;
  callbacks: number;
  bytesRead: number;
}

async function parse(
  middleware: RequestHandler,
  chunks: Iterable<Buffer>,
  options: {
    length?: string;
    abortAfter?: number;
    errorAfter?: number;
    closeAfter?: number;
    contentType?: string;
    body?: unknown;
    endedResponse?: boolean;
    alreadyAborted?: boolean;
    endResponseAfter?: number;
    unframed?: boolean;
    settleMs?: number;
  } = {},
): Promise<Outcome> {
  const socket = new Socket();
  // An in-memory response sink: no bind, connect, listen, app, auth secret, or provider.
  socket._write = (_chunk, _encoding, callback) => callback();
  const req = new IncomingMessage(socket) as Request;
  req.headers = {
    "content-type": options.contentType ?? `multipart/form-data; boundary=${boundary}`,
    ...(options.unframed ? {} : options.length === undefined
      ? { "transfer-encoding": "chunked" }
      : { "content-length": options.length }),
  };
  req.method = "POST";
  req.url = "/synthetic-upload";
  req.body = options.body;
  const res = new ServerResponse(req) as Response;
  res.assignSocket(socket);
  const outcome: Outcome = { req, res, callbacks: 0, bytesRead: 0 };
  let complete: () => void = () => {};
  const completion = new Promise<void>((resolve) => { complete = resolve; });
  res.once("finish", complete);
  res.once("close", complete);
  const deadline = setTimeout(() => {
    outcome.error = new Error("Parser did not complete within its synthetic deadline");
    complete();
  }, 1000);

  if (options.endedResponse) res.end();
  if (options.alreadyAborted) req.aborted = true;
  middleware(req, res, (error?: unknown) => {
    outcome.callbacks += 1;
    outcome.error = error;
    if (!res.writableEnded && !res.destroyed) {
      res.statusCode = error && typeof error === "object" && "status" in error
        ? Number(error.status)
        : error ? 500 : 204;
      res.end();
    }
    complete();
  });

  for (const chunk of chunks) {
    if (req.destroyed || res.writableEnded) break;
    outcome.bytesRead += chunk.length;
    req.push(chunk);
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (options.endResponseAfter !== undefined && outcome.bytesRead >= options.endResponseAfter) {
      res.end();
      break;
    }
    if (options.abortAfter !== undefined && outcome.bytesRead >= options.abortAfter) {
      req.emit("aborted");
      break;
    }
    if (options.errorAfter !== undefined && outcome.bytesRead >= options.errorAfter) {
      req.destroy(new Error("Synthetic transport failure"));
      break;
    }
    if (options.closeAfter !== undefined && outcome.bytesRead >= options.closeAfter) {
      req.emit("close");
      break;
    }
  }
  if (options.abortAfter === undefined && options.errorAfter === undefined && options.closeAfter === undefined && !req.destroyed) {
    req.complete = true;
    req.push(null);
  }
  await completion;
  clearTimeout(deadline);
  if (options.settleMs) await new Promise<void>((resolve) => setTimeout(resolve, options.settleMs));
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (!req.destroyed) req.destroy();
  socket.destroy();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return outcome;
}

function expectRejected(result: Outcome, status: number) {
  expect(result.error).toBeInstanceOf(Error);
  expect(result.res.statusCode).toBe(status);
  expect(result.callbacks).toBe(1);
  expect(result.req.body).toBeUndefined();
  expect(result.req.file).toBeUndefined();
  expect(result.req.files).toBeUndefined();
}

describe("DreamLux bounded multipart contracts (in-memory only)", () => {
  test("keeps the asset buffer, filename, scalar fields and clone source", async () => {
    const fields = [["name", "Synthetic asset"], ["quantity", "3"],
      ["store_id", scalarEmployeeFields[2][1]], ["description", ""], ["clone_from_id", "source"]];
    const result = await parse(assetUpload, [
      ...fields.map(([key, value]) => field(key, value)), ...file("image"), end,
    ]);
    expect(result.error).toBeUndefined();
    expect(result.callbacks).toBe(1);
    expect(result.req.body).toEqual(Object.fromEntries(fields));
    expect(result.req.file?.buffer).toEqual(image);
    expect(result.req.file?.originalname).toBe("synthetic.jpg");
    expect(result.req.file?.size).toBe(image.length);
  });

  test("keeps image-less partial updates and asset cloning", async () => {
    for (const data of [[field("quantity", "1")], [field("clone_from_id", "source")]]) {
      const result = await parse(assetUpload, [...data, end]);
      expect(result.error).toBeUndefined();
      expect(result.req.file).toBeUndefined();
    }
  });

  test("keeps all three employee images and the JSON-string price representation", async () => {
    const prices = JSON.stringify({ wedding: 250, conference: 0 });
    const result = await parse(employeeUpload, [
      ...scalarEmployeeFields.map(([key, value]) => field(key, value)), field("event_prices", prices),
      ...file("id_card_front"), ...file("id_card_back", image, "image/png", "back.png"),
      ...file("profile_photo", image, "image/webp", "profile.webp"), end,
    ]);
    expect(result.error).toBeUndefined();
    expect(result.req.body.event_prices).toBe(prices);
    expect(Object.keys(result.req.files ?? {})).toEqual(["id_card_front", "id_card_back", "profile_photo"]);
    if (!result.req.files || Array.isArray(result.req.files)) throw new Error("Expected named employee images");
    for (const files of Object.values(result.req.files)) expect(files[0].buffer).toEqual(image);
  });

  test("accepts 1000 bracketed prices plus all 11 scalar fields and three files", async () => {
    const result = await parse(employeeUpload, [
      ...scalarEmployeeFields.map(([key, value]) => field(key, value)),
      ...Array.from({ length: 1000 }, (_, i) => field(`event_prices[event-${i}]`, String(i))),
      ...file("id_card_front"), ...file("id_card_back"), ...file("profile_photo"), end,
    ]);
    expect(result.error).toBeUndefined();
    expect(Object.keys(result.req.body.event_prices)).toHaveLength(1000);
    expect(result.req.body.event_prices["event-999"]).toBe("999");
    expect(result.req.body.clone_from_id).toBe(scalarEmployeeFields[10][1]);
  });

  test("accepts 1000 JSON-string prices without rewriting the string", async () => {
    const prices = JSON.stringify(Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`event-${i}`, i])));
    const result = await parse(employeeUpload, [field("event_prices", prices), end]);
    expect(result.error).toBeUndefined();
    expect(result.req.body.event_prices).toBe(prices);
  });

  test("preserves JSON partial-update bodies and skips multipart stream listeners", async () => {
    const body = { full_name: "Name only", event_prices: { conference: 123 } };
    const result = await parse(employeeUpload, [], { contentType: "application/json", body });
    expect(result.error).toBeUndefined();
    expect(result.req.body).toBe(body);
    expect(result.bytesRead).toBe(0);
    expect(result.req.listenerCount("data")).toBe(0);
  });

  test.each([
    ["book.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["BOOK.XLSX", "application/zip"],
    ["legacy-upload", "application/octet-stream"],
  ])("preserves workbook extension OR MIME acceptance: %s / %s", async (name, mime) => {
    const result = await parse(workbookUpload, [...file("workbook", image, mime, name), end]);
    expect(result.error).toBeUndefined();
    expect(result.req.file?.originalname).toBe(name);
    expect(result.req.file?.buffer).toEqual(image);
  });

  test.each([
    [assetUpload, "image"], [employeeUpload, "profile_photo"], [workbookUpload, "workbook"],
  ] satisfies [RequestHandler, string][])("accepts exactly 10MiB per file", async (upload, name) => {
    const result = await parse(upload, [...file(name, Buffer.alloc(10 * MiB), name === "workbook" ? "application/octet-stream" : "image/jpeg"), end]);
    expect(result.error).toBeUndefined();
    const uploaded = result.req.file ?? (!Array.isArray(result.req.files) ? result.req.files?.[name]?.[0] : undefined);
    expect(uploaded?.buffer.length).toBe(10 * MiB);
  });

  test("rejects a byte over 10MiB with 413 and clears partial fields/files", async () => {
    const result = await parse(assetUpload, [field("name", "discard"), ...file("image", Buffer.alloc(10 * MiB + 1)), end]);
    expectRejected(result, 413);
  });

  test("keeps the legacy per-field 1MiB truncation boundary", async () => {
    const allowed = await parse(assetUpload, [field("description", "x".repeat(MiB - 1)), end]);
    expect(allowed.error).toBeUndefined();
    expectRejected(await parse(assetUpload, [field("description", "x".repeat(MiB)), end]), 413);
  });

  test("accepts a 100-byte field name and rejects 101 bytes", async () => {
    expect((await parse(employeeUpload, [field("a".repeat(100), "1"), end])).error).toBeUndefined();
    expectRejected(await parse(employeeUpload, [field("a".repeat(101), "1"), end]), 413);
  });

  test.each([
    [assetUpload, 6], [employeeUpload, 1012], [workbookUpload, 1],
  ] satisfies [RequestHandler, number][])("rejects one field beyond each route budget", async (upload, count) => {
    expectRejected(await parse(upload, [
      ...Array.from({ length: count }, (_, i) => field(`scalar-${i}`, "1")), end,
    ]), 413);
  });

  test.each(["json", "bracket"])("rejects 1001 %s price entries before business callbacks", async (representation) => {
    const prices = Array.from({ length: 1001 }, (_, i) => [`event-${i}`, String(i)]);
    const fields = representation === "json"
      ? [field("event_prices", JSON.stringify(Object.fromEntries(prices)))]
      : prices.map(([key, value]) => field(`event_prices[${key}]`, value));
    expectRejected(await parse(employeeUpload, [...fields, ...file("profile_photo"), end]), 413);
  });

  test.each([
    [assetUpload, "name[nested]"],
    [employeeUpload, "event_prices[event][nested]"],
    [employeeUpload, "event_prices[1]"],
    [employeeUpload, "event_prices[4096]"],
  ] satisfies [RequestHandler, string][])("rejects bounded nested/sparse field names: %s / %s", async (upload, name) => {
    expectRejected(await parse(upload, [field(name, "1"), end]), 413);
  });

  test.each(["{broken", '{"event":{"nested":1}}'])("rejects malformed or nested price JSON before writes: %s", async (value) => {
    expectRejected(await parse(employeeUpload, [field("event_prices", value), ...file("profile_photo"), end]), 400);
  });

  test.each([
    [assetUpload, "image", "image/webp", "image.webp"],
    [employeeUpload, "profile_photo", "image/gif", "image.gif"],
    [workbookUpload, "workbook", "text/plain", "book.csv"],
  ] satisfies [RequestHandler, string, string, string][])("rejects unsupported uploads explicitly", async (upload, name, mime, filename) => {
    expectRejected(await parse(upload, [...file(name, image, mime, filename), end]), 415);
  });

  test("rejects duplicate and unexpected image parts without retaining earlier uploads", async () => {
    expectRejected(await parse(employeeUpload, [
      field("full_name", "discard"), ...file("profile_photo"), ...file("profile_photo"), end,
    ]), 400);
    expectRejected(await parse(assetUpload, [...file("wrong-image"), end]), 400);
  });

  test("rejects malformed and incomplete multipart bodies once", async () => {
    expectRejected(await parse(assetUpload, [Buffer.from("no boundary")]), 400);
    expectRejected(await parse(assetUpload, [...file("image")]), 400);
  });

  test.each([
    [assetUpload, 18 * MiB], [employeeUpload, 44 * MiB], [workbookUpload, 12 * MiB],
  ] satisfies [RequestHandler, number][])("measures the actual wire boundary, not advertised bytes", async (upload, budget) => {
    const payload = [...file(upload === assetUpload ? "image" : upload === employeeUpload ? "profile_photo" : "workbook",
      image, upload === workbookUpload ? "application/octet-stream" : "image/jpeg"), end];
    const overhead = payload.reduce((sum, part) => sum + part.length, 0);
    function* request(bytes: number) {
      yield* payload;
      yield* padding(bytes - overhead);
    }
    const exact = await parse(upload, request(budget), { length: "1" });
    expect(exact.error).toBeUndefined();
    expect(exact.bytesRead).toBe(budget);
    for (const length of [undefined, "1", "0"]) {
      const over = await parse(upload, request(budget + 1), { length });
      expectRejected(over, 413);
      expect(over.bytesRead).toBe(budget + 1);
    }
  }, 10000);

  test("stops oversized preambles without materializing or draining the rest", async () => {
    const over = await parse(assetUpload, padding(19 * MiB));
    expectRejected(over, 413);
    expect(over.bytesRead).toBeLessThan(19 * MiB);
    expect(over.req.destroyed).toBe(true);
  });

  test("clears retained files and fields after an abort", async () => {
    const parts = [field("full_name", "discard"), ...file("profile_photo"), field("email", "upload@example.invalid")];
    const result = await parse(employeeUpload, parts, { abortAfter: parts.reduce((sum, part) => sum + part.length, 0) });
    expectRejected(result, 400);
    expect(result.req.destroyed).toBe(true);
  });

  test("clears partial uploads on a transport error without double callbacks", async () => {
    const result = await parse(employeeUpload, [field("full_name", "discard"), ...file("profile_photo")], { errorAfter: 1 });
    expectRejected(result, 400);
  });

  test("does not parse the already-emitting over-budget chunk through a stale pipe listener", async () => {
    let acceptedFiles = 0;
    const guarded = boundedMultipart("assets", multer({
      storage: multer.memoryStorage(),
      fileFilter: (_req, _file, callback) => { acceptedFiles += 1; callback(null, true); },
    }).single("image"));
    const trailer = Buffer.concat([field("name", "must not be retained"), ...file("image"), end]);
    const chunk = Buffer.alloc(18 * MiB + trailer.length, 32);
    trailer.copy(chunk, 18 * MiB);
    const result = await parse(guarded, [chunk]);
    expectRejected(result, 413);
    expect(acceptedFiles).toBe(0);
    expect(result.res.getHeader("Connection")).toBe("close");
  });

  test("cleans late parser completion after an aggregate abort without a second callback", async () => {
    let lateCompletions = 0;
    const guarded = boundedMultipart("assets", (req, _res, next) => {
      req.body = { partial: "discard" };
      req.once("error", () => {
        setImmediate(() => {
          req.body = { late: "discard" };
          req.file = {
            fieldname: "image", originalname: "synthetic.jpg", encoding: "7bit", mimetype: "image/jpeg",
            size: image.length, stream: Readable.from([image]), buffer: image,
            destination: "", filename: "", path: "",
          };
          req.files = [req.file];
          lateCompletions += 1;
          next();
        });
      });
      req.resume();
    });
    const result = await parse(guarded, padding(19 * MiB), { settleMs: 10 });
    expectRejected(result, 413);
    expect(lateCompletions).toBe(1);
  });

  test("never treats parser completion before request EOF as business success", async () => {
    const prematureParser: RequestHandler = (req, _res, next) => {
      req.body = {};
      req.resume();
      next();
    };
    const result = await parse(boundedMultipart("assets", prematureParser), padding(19 * MiB));
    expectRejected(result, 413);
  });

  test("handles header failures without assuming an active parser error listener", async () => {
    expectRejected(await parse(assetUpload, [], { contentType: "multipart/form-data" }), 400);
    expectRejected(await parse(assetUpload, [], { contentType: "multipart/mixed; boundary=missing" }), 400);
  });

  test("reports unknown parser failures as a generic contextual 500, not their contents", async () => {
    const failure = new Error("untrusted-filename-field-value");
    for (const parser of [
      (() => { throw failure; }) satisfies RequestHandler,
      ((_req, _res, next) => next(failure)) satisfies RequestHandler,
    ]) {
      const result = await parse(boundedMultipart("assets", parser), []);
      expectRejected(result, 500);
      expect(result.error).toMatchObject({ message: "Unable to process upload", upload: "assets" });
      expect(JSON.stringify(result.error)).not.toContain(failure.message);
    }
  });

  test.each([
    ["assets", 18 * MiB, assetUpload],
    ["employees", 44 * MiB, employeeUpload],
    ["finance", 12 * MiB, workbookUpload],
  ] as const)("rejects oversized declared %s uploads before parsing or waiting for body bytes", async (kind, budget, upload) => {
    let parserCalls = 0;
    const guarded = boundedMultipart(kind, (_req, _res, next) => {
      parserCalls += 1;
      next(new Error("Parser must not run for an oversized declared body"));
    });
    expectRejected(await parse(guarded, [], { length: String(budget + 1) }), 413);
    expect(parserCalls).toBe(0);
    const result = await parse(upload, [], { length: String(budget + 1) });
    expectRejected(result, 413);
    expect(result.bytesRead).toBe(0);
    expect(result.res.getHeader("Connection")).toBe("close");
  });

  test("does not send or call downstream middleware after the response has ended", async () => {
    const logger = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await parse(boundedMultipart("assets", (_req, _res, next) => {
        next(new Error("untrusted-private-value"));
      }), [], { endedResponse: true });
      expect(result.callbacks).toBe(0);
      expect(result.req.destroyed).toBe(true);
      expect(logger).toHaveBeenCalledTimes(1);
      expect(logger).toHaveBeenCalledWith("[Multipart upload]", {
        upload: "assets", code: "UPLOAD_ABORTED", status: 400,
      });
      expect(result.req.body).toBeUndefined();
    } finally {
      logger.mockRestore();
    }
  });

  test("rejects early close with a pending file and no end/aborted event", async () => {
    const chunks = [field("full_name", "discard"), ...file("profile_photo")];
    expectRejected(await parse(employeeUpload, chunks, {
      closeAfter: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    }), 400);
  });

  test("does not instantiate a parser for a request that aborted during authorization", async () => {
    let parserCalls = 0;
    const guarded = boundedMultipart("employees", () => { parserCalls += 1; });
    expectRejected(await parse(guarded, [], { alreadyAborted: true }), 400);
    expect(parserCalls).toBe(0);
  });

  test("cancels pending parsing if another middleware ends the response", async () => {
    const logger = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await parse(employeeUpload, [field("full_name", "discard"), ...file("profile_photo")], {
        endResponseAfter: 1,
      });
      expect(result.callbacks).toBe(0);
      expect(result.req.body).toBeUndefined();
      expect(result.req.files).toBeUndefined();
      expect(result.req.destroyed).toBe(true);
      expect(logger).toHaveBeenCalledTimes(1);
      expect(logger).toHaveBeenCalledWith("[Multipart upload]", {
        upload: "employees", code: "UPLOAD_ABORTED", status: 400,
      });
    } finally {
      logger.mockRestore();
    }
  });

  test("rejects unframed multipart input rather than falling through as a successful parse", async () => {
    expectRejected(await parse(assetUpload, [...file("image"), end], { unframed: true }), 400);
  });

  test("accepts three simultaneous 10MiB employee images within the aggregate budget", async () => {
    const bytes = Buffer.alloc(10 * MiB);
    const result = await parse(employeeUpload, [
      field("full_name", "Synthetic employee"), field("event_prices[wedding]", "0"),
      ...file("id_card_front", bytes), ...file("id_card_back", bytes), ...file("profile_photo", bytes), end,
    ]);
    expect(result.error).toBeUndefined();
    if (!result.req.files || Array.isArray(result.req.files)) throw new Error("Expected named employee images");
    for (const files of Object.values(result.req.files)) expect(files[0].size).toBe(10 * MiB);
  });

  test("enforces file counts on named and empty octet-stream file parts", async () => {
    expectRejected(await parse(assetUpload, [
      ...file("image"), ...file("image"), end,
    ]), 413);
    expectRejected(await parse(assetUpload, [
      ...file("image"), ...file("image", Buffer.alloc(0), "application/octet-stream", ""), end,
    ]), 413);
  });

  test("bounds empty filename image parts that Busboy classifies as text fields", async () => {
    const empty = file("image", Buffer.alloc(0), "image/jpeg", "");
    expectRejected(await parse(assetUpload, [
      ...file("image"), ...Array.from({ length: 6 }, () => empty).flat(), end,
    ]), 413);
  });

  test("counts ignored/disposition-less sections toward the independent parts limit", async () => {
    const ignored = Buffer.from(`--${boundary}\r\nX-Test: ignored\r\n\r\nignored\r\n`);
    expectRejected(await parse(assetUpload, [...file("image"), ...Array.from({ length: 6 }, () => ignored), end]), 413);
  });

  test.each([401, 403])("does not parse denied requests or reach a business callback (%i)", async (status) => {
    for (const upload of [assetUpload, employeeUpload, workbookUpload]) {
      let parserCalls = 0;
      let businessCalls = 0;
      const deny: RequestHandler = (_req, res) => { res.statusCode = status; res.end(); };
      const gated: RequestHandler = (req, res, next) => {
        deny(req, res, (error?: unknown) => {
          if (error) return next(error);
          parserCalls += 1;
          upload(req, res, (uploadError?: unknown) => {
            if (uploadError) return next(uploadError);
            businessCalls += 1;
            next();
          });
        });
      };
      const result = await parse(gated, [...file("image"), end]);
      expect(result.res.statusCode).toBe(status);
      expect(result.bytesRead).toBe(0);
      expect(parserCalls).toBe(0);
      expect(businessCalls).toBe(0);
      expect(result.req.body).toBeUndefined();
      expect(result.req.file).toBeUndefined();
      expect(result.req.files).toBeUndefined();
    }
  });
});

describe("shared existing employee event-price normalization", () => {
  test.each([
    [undefined, undefined], ["", {}], ["  ", {}], ["null", {}], ["[]", {}],
    ['{"wedding":"250","conference":null}', { wedding: 250, conference: 0 }],
    [{ wedding: 250, conference: 0 }, { wedding: 250, conference: 0 }],
  ])("preserves normalized values and legacy empty forms", (input, expected) => {
    expect(parseEmployeeEventPrices(input)).toEqual(expected);
  });

  test("applies the logical entry ceiling to direct records as well as JSON", () => {
    const entries = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`event-${i}`, i]));
    expect(Object.keys(parseEmployeeEventPrices(entries) ?? {})).toHaveLength(1000);
    entries.extra = 0;
    expect(() => parseEmployeeEventPrices(entries)).toThrow("At most 1000");
    expect(() => parseEmployeeEventPrices(JSON.stringify(entries))).toThrow("At most 1000");
  });
});
