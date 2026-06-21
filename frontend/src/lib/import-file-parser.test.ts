import { describe, expect, it } from "vitest";
import { isSupportedImportFile, parseCsvText } from "./import-file-parser";

describe("event import file parser", () => {
  it("parses quoted CSV fields with escaped quotes and embedded newlines", () => {
    const parsed = parseCsvText('Event Name,Client Name,Notes\n"DreamLux Setup","Client, Sample","Line 1\nLine ""2"""');

    expect(parsed.headers).toEqual(["Event Name", "Client Name", "Notes"]);
    expect(parsed.rows).toEqual([["DreamLux Setup", "Client, Sample", 'Line 1\nLine "2"']]);
  });

  it("accepts only CSV and XLSX import file names", () => {
    expect(isSupportedImportFile("events.csv")).toBe(true);
    expect(isSupportedImportFile("events.XLSX")).toBe(true);
    expect(isSupportedImportFile("events.xls")).toBe(false);
    expect(isSupportedImportFile("events.pdf")).toBe(false);
  });
});
