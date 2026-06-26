import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ForbiddenState from "../components/ForbiddenState";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mockLang,
  }),
}));

describe("ForbiddenState Component", () => {
  beforeEach(() => {
    mockLang = "en";
    mockPush.mockClear();
    vi.clearAllMocks();
  });

  it("renders with default English titles when props are empty", () => {
    render(<ForbiddenState />);
    expect(screen.getByText("Forbidden: Insufficient privileges")).toBeInTheDocument();
    expect(screen.getByText("Only Admin or System Manager roles can access this page.")).toBeInTheDocument();
    expect(screen.getByText("Back to Dashboard")).toBeInTheDocument(); // button is uppercase text-[10px] uppercase tracking-wider
  });

  it("renders custom title and description when provided", () => {
    render(
      <ForbiddenState
        title="Custom Access Denied"
        description="Custom description text details."
        actionLabel="Custom Go Back"
      />
    );
    expect(screen.getByText("Custom Access Denied")).toBeInTheDocument();
    expect(screen.getByText("Custom description text details.")).toBeInTheDocument();
    expect(screen.getByText("Custom Go Back")).toBeInTheDocument();
  });

  it("renders localized text in Amharic", () => {
    mockLang = "am";
    render(<ForbiddenState />);
    expect(screen.getByText("ክልክል ነው: በቂ ፈቃድ የለዎትም")).toBeInTheDocument();
    expect(screen.getByText("ይህንን ገጽ መድረስ የሚችሉት አስተዳዳሪዎች ወይም የስርዓት አስተዳዳሪዎች ብቻ ናቸው።")).toBeInTheDocument();
    expect(screen.getByText("ወደ ዳሽቦርድ ተመለስ")).toBeInTheDocument();
  });

  it("triggers router push to / by default when action button is clicked", () => {
    render(<ForbiddenState />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("triggers custom callback when onAction prop is provided", () => {
    const customCallback = vi.fn();
    render(<ForbiddenState onAction={customCallback} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(customCallback).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
