import "./setup";
import { describe, test, expect, mock, beforeAll } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

// Mock storage
const mockQuery = mock(() => Promise.resolve({ rows: [] as any[] }));

export const fakeChain = (isSingle = false): any => {
  const chain: any = {
    select: () => fakeChain(isSingle),
    eq: () => fakeChain(isSingle),
    neq: () => fakeChain(isSingle),
    is: () => fakeChain(isSingle),
    not: () => fakeChain(isSingle),
    or: () => fakeChain(isSingle),
    order: () => fakeChain(isSingle),
    range: () => fakeChain(isSingle),
    update: () => fakeChain(isSingle),
    insert: () => fakeChain(isSingle),
    delete: () => fakeChain(isSingle),
    in: () => fakeChain(isSingle),
    limit: () => fakeChain(isSingle),
    match: () => fakeChain(isSingle),
    ilike: () => fakeChain(isSingle),
    single: () => fakeChain(true),
    then: async (resolve: any, _reject: any) => {
      try {
        const res = await mockQuery();
        if (!res) return resolve({ data: null, error: null, count: 0 });
        
        let countValue = 0;
        if (res?.rows?.[0]?.count !== undefined) {
          countValue = parseInt(res.rows[0].count as string);
        } else {
          countValue = res?.rows?.length || 0;
        }

        const rows = res?.rows || [];
        resolve({
          data: isSingle ? (rows[0] || null) : rows,
          error: null,
          count: countValue,
        });
      } catch (err) {
        // Return the error in the Supabase-like response instead of throwing rejecting the Promise directly (Supabase handles it as `{error: err}`).
        resolve({ data: null, error: err, count: 0 });
      }
    }
  };
  return chain;
};

mock.module("../db/supabase", () => ({
  supabase: {
    from: () => fakeChain(),
  },
}));

mock.module("../storage/storage", () => ({
  uploadImage: mock(() => Promise.resolve()),
  deleteImage: mock(() => Promise.resolve()),
  getPublicUrl: mock((key: string) => `https://storage.test.com/${key}`),
  downloadImage: mock(() => Promise.resolve(Buffer.from("fake-image"))),
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

const JWT_SECRET = "test-secret";

function getToken(): string {
  return jwt.sign({ role: "SUPER_ADMIN" }, JWT_SECRET, { expiresIn: "1h" });
}

describe("Auth", () => {
  test("POST /auth/login — valid password returns token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ password: "test-password" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");

    // Token should be a valid JWT
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded).toHaveProperty("role", "SUPER_ADMIN");
  });

  test("POST /auth/login — wrong password returns 401", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Invalid username or password");
  });

  test("POST /auth/login — missing password returns 401", async () => {
    const res = await request(app).post("/auth/login").send({});

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Invalid credentials");
  });

  test("POST /auth/login — empty string password returns 401", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ password: "" });

    expect(res.status).toBe(401);
  });

  test("Protected route — no token returns 401", async () => {
    const res = await request(app).get("/assets");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Unauthorized");
  });

  test("Protected route — invalid token returns 401", async () => {
    const res = await request(app)
      .get("/assets")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Invalid token");
  });

  test("Protected route — expired token returns 401", async () => {
    const expiredToken = jwt.sign({ role: "SUPER_ADMIN" }, JWT_SECRET, {
      expiresIn: "-1h",
    });

    const res = await request(app)
      .get("/assets")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
  });

  test("Protected route — valid token succeeds", async () => {
    const token = getToken();
    const res = await request(app)
      .get("/assets")
      .set("Authorization", `Bearer ${token}`);

    // Should not be 401
    expect(res.status).not.toBe(401);
  });

  test("Protected route — malformed Authorization header returns 401", async () => {
    const res = await request(app)
      .get("/assets")
      .set("Authorization", "NotBearer some-token");

    expect(res.status).toBe(401);
  });
});

describe("Health Check", () => {
  test("GET /health returns status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("timestamp");
  });
});
