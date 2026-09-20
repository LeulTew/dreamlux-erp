import { describe, expect, test } from "bun:test";
import { assertImportNativeReceipt } from "./native-receipt";

describe("complete native import receipt", () => {
  test("accepts all twelve passing cases without skipped or failed cases", () => {
    expect(() => assertImportNativeReceipt(" 12 pass\n 0 fail\nRan 12 tests across 1 file.")).not.toThrow();
  });

  test("accepts the same complete receipt with terminal color codes", () => {
    expect(() => assertImportNativeReceipt("\x1b[32m 12 pass\x1b[0m\n 0 skip\n 0 fail")).not.toThrow();
  });

  test.each([
    { name: "missing output", output: "" },
    { name: "zero cases", output: " 0 pass\n 0 fail" },
    { name: "the previous eleven-case suite", output: " 11 pass\n 0 fail" },
    { name: "an unexpected additional case", output: " 13 pass\n 0 fail" },
    { name: "a skipped case", output: " 12 pass\n 1 skip\n 0 fail" },
    { name: "a failed case", output: " 12 pass\n 1 fail" },
    { name: "an unhandled runner error", output: " 12 pass\n 0 fail\n 1 error" },
  ])("rejects $name", ({ output }) => {
    expect(() => assertImportNativeReceipt(output)).toThrow("incomplete receipt");
  });
});
