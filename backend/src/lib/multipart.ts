import multer from "multer";
import type { Request, RequestHandler } from "express";

const MiB = 1024 * 1024;
const maxEventPrices = 1000;
type UploadKind = "assets" | "employees" | "finance";
type UploadLimits = NonNullable<multer.Options["limits"]> & { fieldArrayIndexLimit: number };

const policies = {
  assets: { fields: 5, files: 1, depth: 0, bytes: 18 * MiB },
  employees: { fields: 11 + maxEventPrices, files: 3, depth: 1, bytes: 44 * MiB },
  finance: { fields: 0, files: 1, depth: 0, bytes: 12 * MiB },
} as const;

export class UploadError extends Error {
  constructor(
    readonly status: 400 | 413 | 415 | 500,
    readonly code: string,
    message: string,
    readonly upload: UploadKind,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

function limits(kind: UploadKind): UploadLimits {
  const policy = policies[kind];
  return {
    fileSize: 10 * MiB,
    files: policy.files,
    fields: policy.fields,
    // Busboy emits partsLimit when the counter reaches this value, not after it.
    parts: policy.fields + policy.files + 1,
    fieldNameSize: 100,
    fieldSize: MiB,
    fieldNestingDepth: policy.depth,
    fieldArrayIndexLimit: 0,
    headerPairs: 2000,
  };
}

function uploadError(error: unknown, kind: UploadKind): UploadError {
  if (error instanceof UploadError) return error;
  if (error instanceof multer.MulterError) {
    const code: string = error.code;
    const invalid = ["LIMIT_UNEXPECTED_FILE", "MISSING_FIELD_NAME", "INVALID_FIELD_NAME", "STREAM_DESTROYED"].includes(code);
    if (invalid) return new UploadError(400, code, "Invalid multipart upload", kind);
    if (["LIMIT_PART_COUNT", "LIMIT_FILE_SIZE", "LIMIT_FILE_COUNT", "LIMIT_FIELD_KEY", "LIMIT_FIELD_VALUE",
      "LIMIT_FIELD_COUNT", "LIMIT_FIELD_NESTING", "LIMIT_FIELD_ARRAY_INDEX"].includes(code)) {
      return new UploadError(413, code, "Upload exceeds the multipart limits", kind);
    }
  }
  if (error instanceof Error && /^(Multipart: Boundary not found|Malformed content type|Unsupported content type:|Malformed part header|Unexpected end of (form|file))/.test(error.message)) {
    return new UploadError(400, "INVALID_MULTIPART", "Malformed multipart upload", kind);
  }
  return new UploadError(500, "UPLOAD_FAILED", "Unable to process upload", kind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseEmployeeEventPrices(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  try {
    // Keep the existing JSON/record Number(value ?? 0) normalization, including blank JSON fields.
    const raw: unknown = typeof value === "string" ? (value.trim() ? JSON.parse(value) : {}) : value;
    const entries = Object.entries(raw || {});
    if (entries.length > maxEventPrices) {
      throw new UploadError(413, "LIMIT_EVENT_PRICE_COUNT", "At most 1000 event-price entries are allowed", "employees");
    }
    const normalized = Object.fromEntries(entries.map(([key, price]) => [key, Number(price ?? 0)]));
    if (Object.values(normalized).some((price) => !Number.isFinite(price) || price < 0)) {
      throw new UploadError(400, "INVALID_EVENT_PRICES", "Invalid event_prices payload", "employees");
    }
    return normalized;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new UploadError(400, "INVALID_EVENT_PRICES", "Invalid event_prices payload", "employees");
    }
    throw error;
  }
}

function validateBody(body: unknown, kind: UploadKind): void {
  if (!isRecord(body)) throw new UploadError(400, "INVALID_MULTIPART", "Malformed multipart upload", kind);
  for (const [key, value] of Object.entries(body)) {
    const names = isRecord(value) ? Object.keys(value).map((child) => `${key}[${child}]`) : [key];
    if (names.some((name) => Buffer.byteLength(name) > 100)) {
      throw new UploadError(413, "LIMIT_FIELD_KEY", "Upload field name exceeds 100 bytes", kind);
    }
  }
  if (kind === "employees") parseEmployeeEventPrices(body.event_prices);
}

function clearPartialUpload(req: Request): void {
  req.body = undefined;
  delete req.file;
  delete req.files;
}

export function boundedMultipart(kind: UploadKind, parser: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (!/^multipart(?:\/|$)/i.test(req.headers["content-type"] ?? "")) {
      next();
      return;
    }

    let state: "pending" | "succeeded" | "failed" = "pending";
    let bytes = 0;

    function detach() {
      req.removeListener("data", onData);
      req.removeListener("error", onError);
      req.removeListener("aborted", onAborted);
      req.removeListener("close", onClose);
      req.removeListener("end", succeed);
      res.removeListener("finish", onResponseClosed);
      res.removeListener("close", onResponseClosed);
    }

    function destroyRequest() {
      req.destroy();
      clearPartialUpload(req);
    }

    function fail(error: UploadError, abortParser: boolean) {
      if (state === "succeeded") return;
      if (state === "failed") {
        clearPartialUpload(req);
        return;
      }
      state = "failed";
      // Multer 2.3 synchronously destroys Busboy on request error, before a stale data listener can write.
      if (abortParser && !req.destroyed) req.emit("error", error);
      req.unpipe();
      req.pause();
      clearPartialUpload(req);

      if (res.headersSent || res.writableEnded || res.destroyed || req.socket.destroyed) {
        console.error("[Multipart upload]", { upload: kind, code: error.code, status: error.status });
        res.destroy();
        destroyRequest();
        return;
      }

      res.setHeader("Connection", "close");
      res.once("finish", destroyRequest);
      res.once("close", destroyRequest);
      next(error);
    }

    function onData(chunk: Buffer | string) {
      if (state !== "pending") return;
      bytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      if (bytes > policies[kind].bytes) {
        fail(new UploadError(413, "LIMIT_UPLOAD_BYTES", "Upload exceeds the request size limit", kind), true);
      }
    }

    function onError() {
      fail(new UploadError(400, "UPLOAD_INTERRUPTED", "Upload interrupted", kind), false);
    }

    function onAborted() {
      fail(new UploadError(400, "UPLOAD_ABORTED", "Upload aborted", kind), true);
    }

    function onResponseClosed() {
      if (state === "pending") onAborted();
    }

    function onClose() {
      if (state === "pending" && !req.readableEnded) onAborted();
      if (state === "failed") clearPartialUpload(req);
      detach();
    }

    function succeed() {
      if (state !== "pending") {
        if (state === "failed") clearPartialUpload(req);
        return;
      }
      if (!req.readableEnded) {
        req.once("end", succeed);
        return;
      }
      if (!req.complete || req.aborted) {
        onAborted();
        return;
      }
      try {
        validateBody(req.body, kind);
      } catch (error) {
        fail(uploadError(error, kind), false);
        return;
      }
      state = "succeeded";
      detach();
      next();
    }

    req.on("error", onError);
    req.on("aborted", onAborted);
    req.on("close", onClose);
    req.prependListener("data", onData);
    res.once("finish", onResponseClosed);
    res.once("close", onResponseClosed);
    if (req.aborted || req.destroyed || res.writableEnded || res.destroyed) {
      onAborted();
      return;
    }
    const declaredLength = req.headers["content-length"];
    if (declaredLength !== undefined && /^\d+$/.test(declaredLength)
        && Number(declaredLength) > policies[kind].bytes) {
      fail(new UploadError(413, "LIMIT_UPLOAD_BYTES", "Upload exceeds the request size limit", kind), false);
      return;
    }
    try {
      parser(req, res, (error?: unknown) => {
        if (state === "failed") {
          clearPartialUpload(req);
          return;
        }
        if (error) fail(uploadError(error, kind), false);
        else if (!isRecord(req.body)) fail(new UploadError(400, "INVALID_MULTIPART", "Malformed multipart upload", kind), false);
        else succeed();
      });
    } catch (error) {
      fail(uploadError(error, kind), true);
    }
  };
}

export const assetUpload = boundedMultipart("assets", multer({
  storage: multer.memoryStorage(),
  limits: limits("assets"),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new UploadError(415, "UNSUPPORTED_IMAGE", "Only JPEG and PNG images are allowed", "assets"));
    }
  },
}).single("image"));

export const employeeUpload = boundedMultipart("employees", multer({
  storage: multer.memoryStorage(),
  limits: limits("employees"),
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new UploadError(415, "UNSUPPORTED_IMAGE", "Only JPEG, PNG and WebP images are allowed", "employees"));
    }
  },
}).fields([
  { name: "id_card_front", maxCount: 1 },
  { name: "id_card_back", maxCount: 1 },
  { name: "profile_photo", maxCount: 1 },
]));

export const workbookUpload = boundedMultipart("finance", multer({
  storage: multer.memoryStorage(),
  limits: limits("finance"),
  fileFilter: (_req, file, cb) => {
    const validExtension = /\.xlsx$/i.test(file.originalname || "");
    const validMime = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ].includes(file.mimetype);
    if (!validExtension && !validMime) {
      cb(new UploadError(415, "UNSUPPORTED_WORKBOOK", "Only .xlsx workbooks are supported", "finance"));
      return;
    }
    cb(null, true);
  },
}).single("workbook"));
