import { describe, it, expect, vi } from "vitest";
import { generateReportPdf } from "@/lib/pdf-report";

// jsPDF's save() triggers a browser download; stub it so we can assert the
// document was built and handed off without touching the DOM download path.
vi.mock("jspdf", async (importOriginal) => {
  const mod = await importOriginal<typeof import("jspdf")>();
  const Real = mod.default;
  class TestPdf extends Real {
    save = vi.fn();
  }
  return { ...mod, default: TestPdf };
});

describe("generateReportPdf (issue #152)", () => {
  it("builds a neutral tabular document and saves it without throwing", () => {
    expect(() =>
      generateReportPdf({
        title: "Capital Investment Register",
        subtitle: "Month: 2026-07",
        meta: ["Generated: now", "Records: 2"],
        sections: [{
          columns: ["Date", "Item", "Amount"],
          rows: [
            ["2026-07-01", "Projector", "ETB 10,000.00"],
            ["2026-07-02", "Speakers", "ETB 4,500.00"],
          ],
          foot: [["", "Total", "ETB 14,500.00"]],
          columnStyles: { 2: { halign: "right" } },
        }],
        fileName: "investments-2026-07.pdf",
        orientation: "l",
      }),
    ).not.toThrow();
  });

  it("handles an empty section without throwing", () => {
    expect(() =>
      generateReportPdf({
        title: "Empty Report",
        sections: [{ columns: ["A", "B"], rows: [] }],
        fileName: "empty.pdf",
      }),
    ).not.toThrow();
  });

  it("prints the generated document (not the screen) when output is 'print' (issue #189)", () => {
    // Print path mounts a hidden iframe of the generated PDF and invokes its own
    // print — it must never call window.print() on the live app screen.
    const appPrint = vi.spyOn(window, "print").mockImplementation(() => {});
    const appended: string[] = [];
    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "iframe") appended.push(tag);
      return el;
    });

    expect(() =>
      generateReportPdf({
        title: "Profit Report",
        subtitle: "2026-01-01 → 2026-12-31",
        output: "print",
        sections: [{ columns: ["Month", "Net"], rows: [["Jan", "ETB 1,000"]] }],
        fileName: "profit.pdf",
      }),
    ).not.toThrow();

    expect(appended).toContain("iframe"); // clean document iframe, not a screen print
    expect(appPrint).not.toHaveBeenCalled(); // never prints the app screen synchronously

    createSpy.mockRestore();
    appPrint.mockRestore();
  });
});
