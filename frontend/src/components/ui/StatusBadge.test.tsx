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
});
