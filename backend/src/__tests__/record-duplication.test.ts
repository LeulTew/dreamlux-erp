import {
  mockUploadImage,
  mockDeleteImage,
  getToken,
  mockQuery,
} from "./setup_helpers";
import "./setup";
import { describe, test, expect, mock, beforeEach, beforeAll } from "bun:test";
import request from "supertest";

const sourceItemImageKey = "source-store/source-item.webp";
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

mock.module("../db/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {
        select: mock(() => chain),
        eq: mock(() => chain),
        limit: mock(() => chain),
        single: mock(() => chain),
        insert: mock(() => chain),
        then: mock((resolve: any) => {
          if (table === "items") {
            resolve({
              data: {
                id: "new-duplicated-item-uuid",
                name: "Duplicated Item (Copy)",
                quantity: 5,
                store_id: VALID_UUID,
                image_key: sourceItemImageKey,
              },
              error: null,
            });
          } else if (table === "categories") {
            resolve({
              data: [{ id: "cat-1" }],
              error: null,
            });
          } else if (table === "employees") {
            resolve({
              data: {
                id: 10,
                full_name: "Daniel Yohannes (Copy)",
                employee_id: "EL-1002",
              },
              error: null,
            });
          } else {
            resolve({ data: [], error: null });
          }
        }),
      };
      return chain;
    },
  },
}));

mock.module("../storage", () => ({
  downloadImage: mock(() => Promise.resolve(Buffer.from("fake-image-bytes"))),
  uploadImage: mock(() => Promise.resolve()),
  getPublicUrl: mock((key: string) => `https://storage.test.com/${key}`),
}));

let app: import("express").Application;

beforeAll(async () => {
  const mod = await import("../index");
  app = mod.default;
});

describe("Record Duplication Integration Tests", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockUploadImage.mockReset();
    mockDeleteImage.mockReset();
  });

  test("POST /items with clone_from_id duplicates asset records and images", async () => {
    const res = await request(app)
      .post("/items")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        name: "Duplicated Item (Copy)",
        quantity: 5,
        store_id: VALID_UUID,
        clone_from_id: "source-item-uuid",
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Duplicated Item (Copy)");
    expect(res.body.image_url).toBe("https://storage.test.com/source-store/source-item.webp");
  });

  test("POST /employees with clone_from_id duplicates employee records and pictures", async () => {
    const res = await request(app)
      .post("/employees")
      .set("Authorization", `Bearer ${getToken()}`)
      .send({
        full_name: "Daniel Yohannes (Copy)",
        employee_id: "EL-1002",
        gender: "MALE",
        dob: "1990-01-01",
        hired_date: "2026-01-01",
        status: "ACTIVE",
        base_salary: 15000,
        salary_level_id: VALID_UUID,
        clone_from_id: "source-employee-id",
      });

    expect(res.status).toBe(201);
    expect(res.body.full_name).toBe("Daniel Yohannes (Copy)");
    expect(res.body.employee_id).toBe("EL-1002");
  });
});
