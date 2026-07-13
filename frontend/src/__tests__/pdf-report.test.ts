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
});
