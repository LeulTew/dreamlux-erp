/** @vitest-environment jsdom */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PdfExportModal from "./PdfExportModal";

const generateReportPdf = vi.fn();
vi.mock("@/lib/pdf-report", () => ({
  generateReportPdf: (opts: unknown) => generateReportPdf(opts),
}));

const columns = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount", align: "right" as const },
];

describe("PdfExportModal (issue #189 print action)", () => {
  beforeEach(() => generateReportPdf.mockClear());

  it("offers both Print and Download actions", () => {
    render(
      <PdfExportModal
        open
        onClose={vi.fn()}
        title="Overheads"
        columns={columns}
        buildRows={() => [["Rent", "ETB 1,000"]]}
        fileName="overheads.pdf"
      />,
    );
    expect(screen.getByRole("button", { name: /^Print$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download PDF/i })).toBeInTheDocument();
  });

  it("Print builds the document with output 'print' (not a screenshot)", () => {
    const onClose = vi.fn();
    render(
      <PdfExportModal
        open
        onClose={onClose}
        title="Overheads"
        columns={columns}
        buildRows={() => [["Rent", "ETB 1,000"]]}
        fileName="overheads.pdf"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Print$/i }));
    expect(generateReportPdf).toHaveBeenCalledTimes(1);
    expect(generateReportPdf.mock.calls[0][0]).toMatchObject({ output: "print", fileName: "overheads.pdf" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Download builds the document with output 'save'", () => {
    render(
      <PdfExportModal
        open
        onClose={vi.fn()}
        title="Overheads"
        columns={columns}
        buildRows={() => [["Rent", "ETB 1,000"]]}
        fileName="overheads.pdf"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/i }));
    expect(generateReportPdf.mock.calls[0][0]).toMatchObject({ output: "save" });
  });
});
