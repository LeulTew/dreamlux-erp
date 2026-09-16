import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("shared-ERP audit release hold", () => {
  test.each(["vercel.json", "backend/vercel.json", "frontend/vercel.json"])(
    "%s holds only automatic main deployments",
    (relativePath) => {
      const config = JSON.parse(readFileSync(join(root, relativePath), "utf8"));
      expect(config.git?.deploymentEnabled).toEqual({ main: false });
    },
  );
});
