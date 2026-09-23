import { describe, expect, test } from "bun:test";
import { assertImportNativeReceipt } from "./native-receipt";

describe("complete native import receipt", () => {
  const complete = " 12 pass\n 0 fail\nRan 12 tests across 1 file.\n 19 pass\n 0 fail\nRan 19 tests across 1 file.";

  test("accepts all import and finance audit cases without skipped or failed cases", () => {
    expect(() => assertImportNativeReceipt(complete)).not.toThrow();
  });

  test("accepts the same complete receipt with terminal color codes", () => {
    expect(() => assertImportNativeReceipt("\x1b[32m 12 pass\x1b[0m\n 0 skip\n 0 fail\n\x1b[32m 19 pass\x1b[0m\n 0 skip\n 0 fail")).not.toThrow();
  });

  test.each([
    { name: "missing output", output: "" },
    { name: "zero cases", output: " 0 pass\n 0 fail" },
    { name: "the previous eleven-case suite", output: " 11 pass\n 0 fail\n 19 pass\n 0 fail" },
    { name: "an unexpected additional import case", output: " 13 pass\n 0 fail\n 19 pass\n 0 fail" },
    { name: "an import-only receipt without the finance audit process", output: " 12 pass\n 0 fail" },
    { name: "an incomplete finance audit process", output: " 12 pass\n 0 fail\n 18 pass\n 0 fail" },
    { name: "reordered processes", output: " 19 pass\n 0 fail\n 12 pass\n 0 fail" },
    { name: "an additional unexpected process", output: `${complete}\n 1 pass\n 0 fail` },
    { name: "a skipped case", output: " 12 pass\n 1 skip\n 0 fail\n 19 pass\n 0 fail" },
    { name: "a failed case", output: " 12 pass\n 0 fail\n 19 pass\n 1 fail" },
    { name: "an unhandled runner error", output: `${complete}\n 1 error` },
  ])("rejects $name", ({ output }) => {
    expect(() => assertImportNativeReceipt(output)).toThrow("incomplete receipt");
  });
});
