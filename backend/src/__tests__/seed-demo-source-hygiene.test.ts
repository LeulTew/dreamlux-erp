import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Additive Demo Dataset Seed Engine (dreamlux-demo-2026q3-v1)", () => {
  test("Code Hygiene: Core implementation contains no TRUNCATE, DROP, or Math.random", () => {
    for (const relative of ["../lib/seed-demo-additive-core.ts", "../db/seed-demo-additive.ts"]) {
      const content = readFileSync(join(__dirname, relative), "utf8");
      for (const forbidden of ["TRUNCATE", "DROP TABLE", "Math.random"]) {
        expect(content.includes(forbidden), `${relative} contains ${forbidden}`).toBe(false);
      }
    }
  });
});
