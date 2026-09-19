import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("preserves backup commands and wires offline verification and real SDK tests", () => {
  const root = join(__dirname, "..", "..", "..");
  const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const backend: unknown = JSON.parse(readFileSync(join(root, "backend", "package.json"), "utf8"));
  const workflow: unknown = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8"));
  expect(manifest).toMatchObject({
    scripts: {
      "backup:storage": "bun run --cwd backend src/db/backup-storage.ts",
      backup: "bun run backup:storage && bun run backup:db",
      "verify:storage": "bun --no-env-file run --cwd backend verify:storage",
      "test:storage": "bun --no-env-file run --cwd backend test:storage",
    },
  });
  expect(backend).toMatchObject({
    scripts: {
      "verify:storage": "bun --no-env-file src/db/verify-storage-snapshot.ts",
      "test:storage": "DREAMLUX_STORAGE_HTTP_TESTS=1 bun --no-env-file --config=bunfig.backup.toml test src/db/storage-snapshot.integration.test.ts src/db/storage-cli-regression.integration.test.ts",
    },
  });
  expect(workflow).toMatchObject({
    jobs: {
      "backend-test": {
        "timeout-minutes": 3,
        steps: expect.arrayContaining([{ name: "Verify synthetic Storage backup workflow", run: "bun run test:storage" }]),
      },
    },
  });
});
