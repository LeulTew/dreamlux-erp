/** @vitest-environment jsdom */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PrintOptionsModal from "./PrintOptionsModal";

describe("PrintOptionsModal", () => {
  it("hides event toggle by default and submits image option", () => {
    const onPrint = vi.fn();

    render(
      <PrintOptionsModal
        isOpen
        onClose={vi.fn()}
        onPrint={onPrint}
      />
    );

    expect(screen.queryByText(/Include Event Prices/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Generate PDF/i }));

    expect(onPrint).toHaveBeenCalledWith({ includeImages: true, includeEvents: false });
  });

  it("submits includeEvents=true when the event toggle is enabled", () => {
    const onPrint = vi.fn();

    render(
      <PrintOptionsModal
        isOpen
        onClose={vi.fn()}
        onPrint={onPrint}
        showIncludeEvents
      />
    );

    fireEvent.click(screen.getByText(/Include Event Prices/i));
    fireEvent.click(screen.getByRole("button", { name: /Generate PDF/i }));

    expect(onPrint).toHaveBeenCalledWith({ includeImages: true, includeEvents: true });
  });
});
