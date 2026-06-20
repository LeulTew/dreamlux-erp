import { mock, beforeEach } from "bun:test";
import { invalidateAllCache } from "../lib/permissions-cache";

beforeEach(() => {
  invalidateAllCache();
});
import { fakeChain, mockUploadImage, mockDeleteImage, mockGetPublicUrl } from "./setup_helpers";

process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_PASSWORD = "test-password";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.NODE_ENV = "test";

// Inject Supabase mock into globalThis to bypass all ESM/CJS interop logic
(globalThis as any).__mockSupabase = {
  from: () => fakeChain(),
};

// Mock PostgreSQL pool
mock.module("../db/pool", () => ({
  pool: {
    query: mock(() => Promise.resolve({ rows: [] })),
    connect: mock(() => Promise.resolve({ release: mock(() => {}), query: mock(() => Promise.resolve({ rows: [] })) })),
  }
}));

mock.module("../storage/storage", () => ({
  uploadImage: mockUploadImage,
  deleteImage: mockDeleteImage,
  getPublicUrl: mockGetPublicUrl,
  downloadImage: mock(() => Promise.resolve(Buffer.from("fake-image"))),
}));

mock.module("sharp", () => ({
  default: () => ({
    rotate: () => ({
      resize: () => ({
        webp: () => ({
          toBuffer: () => Promise.resolve(Buffer.from("mock-webp-buffer")),
        }),
      }),
    }),
  }),
}));

mock.module("file-type", () => ({
  fromBuffer: mock(() => Promise.resolve({ mime: "image/jpeg", ext: "jpg" })),
}));

// Mock pg.Client to prevent real connection attempts in startup migrations
mock.module("pg", () => ({
  Client: mock(() => ({
    connect: mock(() => Promise.resolve()),
    query: mock(() => Promise.resolve({ rows: [], rowCount: 0 })),
    end: mock(() => Promise.resolve()),
  })),
  Pool: mock(() => ({
    query: mock(() => Promise.resolve({ rows: [] })),
    connect: mock(() => Promise.resolve({ release: mock(() => {}), query: mock(() => Promise.resolve({ rows: [] })) })),
  })),
}));

// Direct instance override to protect against module cache pollution
import { pool } from "../db/pool";
try {
  pool.query = mock(() => Promise.resolve({ rows: [] })) as any;
  pool.connect = mock(() => Promise.resolve({
    release: mock(() => {}),
    query: mock(() => Promise.resolve({ rows: [] }))
  })) as any;
} catch (e) {
  console.warn("Failed to override pool instance methods directly:", e);
}

