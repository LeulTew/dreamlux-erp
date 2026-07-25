// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import StatusBadge from "../components/ui/StatusBadge";

// Issue #197: the Event Workspace renders attendance through StatusBadge, and that component
// resolves its own translations from an uppercase key map. An unregistered status silently
// falls back to the raw English string, so these tests exist to catch a missing Amharic entry.
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    get lang() {
      return mockLang;
    },
  }),
}));

describe("StatusBadge attendance statuses (issue #197)", () => {
  it("renders the English attendance statuses", () => {
    mockLang = "en";
    render(<StatusBadge status="ATTENDANCE_UNVERIFIED" />);
    expect(screen.getByText("Attendance unverified")).toBeInTheDocument();

    cleanup();
    render(<StatusBadge status="ATTENDED" />);
    expect(screen.getByText("Attended")).toBeInTheDocument();
  });

  it("renders the Amharic attendance statuses", () => {
    mockLang = "am";
    render(<StatusBadge status="ATTENDANCE_UNVERIFIED" />);
    // Must not fall through to the raw English key.
    expect(screen.queryByText("Attendance unverified")).toBeNull();
    expect(screen.queryByText("ATTENDANCE_UNVERIFIED")).toBeNull();
    expect(screen.getByText("መገኘት አልተረጋገጠም")).toBeInTheDocument();

    cleanup();
    render(<StatusBadge status="ATTENDED" />);
    expect(screen.getByText("ተገኝቷል")).toBeInTheDocument();
  });

  it("styles unverified attendance as an action-needed state, not a settled one", () => {
    mockLang = "en";
    const { container } = render(<StatusBadge status="ATTENDANCE_UNVERIFIED" />);
    expect(container.firstChild).toHaveClass("text-warning");

    cleanup();
    const verified = render(<StatusBadge status="ATTENDED" />);
    expect(verified.container.firstChild).toHaveClass("text-success");
  });
});
