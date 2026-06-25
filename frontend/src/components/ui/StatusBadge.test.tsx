// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import StatusBadge from "./StatusBadge";

describe("StatusBadge component", () => {
  it("renders success variant status correctly", () => {
    render(<StatusBadge status="Completed" />);
    const textEl = screen.getByText("Completed");
    expect(textEl).toBeInTheDocument();
    const container = textEl.parentElement;
    expect(container).not.toBeNull();
    expect(container!.className).toContain("bg-success/10");
  });

  it("renders warning variant status correctly", () => {
    render(<StatusBadge status="Ongoing" />);
    const textEl = screen.getByText("Ongoing");
    expect(textEl).toBeInTheDocument();
    const container = textEl.parentElement;
    expect(container).not.toBeNull();
    expect(container!.className).toContain("bg-warning/10");
  });

  it("renders danger variant status correctly", () => {
    render(<StatusBadge status="Rejected" />);
    const textEl = screen.getByText("Rejected");
    expect(textEl).toBeInTheDocument();
    const container = textEl.parentElement;
    expect(container).not.toBeNull();
    expect(container!.className).toContain("bg-danger/10");
  });

  it("renders info variant status correctly", () => {
    render(<StatusBadge status="Planned" />);
    const textEl = screen.getByText("Planned");
    expect(textEl).toBeInTheDocument();
    const container = textEl.parentElement;
    expect(container).not.toBeNull();
    expect(container!.className).toContain("bg-primary-light");
  });

  it("renders neutral variant status correctly by default", () => {
    render(<StatusBadge status="SomeUnknownStatus" />);
    const textEl = screen.getByText("SomeUnknownStatus");
    expect(textEl).toBeInTheDocument();
    const container = textEl.parentElement;
    expect(container).not.toBeNull();
    expect(container!.className).toContain("bg-card-alt");
  });

  it("maps blocked and overdue statuses to the correct semantic variants", () => {
    const { rerender } = render(<StatusBadge status="Blocked" />);
    expect(screen.getByText("Blocked").parentElement?.className).toContain("bg-danger/10");

    rerender(<StatusBadge status="Overdue" />);
    expect(screen.getByText("Overdue").parentElement?.className).toContain("bg-warning/10");
  });

  it("maps archived and restricted statuses to neutral and info variants", () => {
    const { rerender } = render(<StatusBadge status="Archived" />);
    expect(screen.getByText("Archived").parentElement?.className).toContain("bg-card-alt");

    rerender(<StatusBadge status="Restricted" />);
    expect(screen.getByText("Restricted").parentElement?.className).toContain("bg-primary-light");
  });

  it("renders Amharic translations for standardized statuses", () => {
    localStorage.setItem("lang", "am");
    render(<StatusBadge status="Blocked" />);
    expect(screen.getByText("የተከለከለ")).toBeInTheDocument();
    localStorage.removeItem("lang");
  });
});
