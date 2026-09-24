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
    expect(screen.getByText("You do not have the required permissions to view this content.")).toBeInTheDocument();
    expect(screen.getByText("Back to Dashboard")).toBeInTheDocument();
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
    expect(screen.getByText("ይህንን ይዘት ለማየት የሚያስፈልግዎት ፈቃድ የለዎትም።")).toBeInTheDocument();
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

  it.each(["en", "am"])("uses defined theme tokens and a readable minimum target for the %s action", (lang) => {
    mockLang = lang;
    render(<ForbiddenState />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("border-border", "bg-card", "text-foreground");
    expect(button).toHaveClass("min-h-12", "min-w-12", "text-sm", "font-semibold");
    expect(button.className).not.toMatch(/(?:text|bg|border)-gold|bg-neutral-950|text-\[10px\]/);
    expect(button).toHaveAccessibleName(lang === "am" ? "ወደ ዳሽቦርድ ተመለስ" : "Back to Dashboard");
  });

  it("keeps hover pointer-safe and supplies visible keyboard focus and reduced-motion behavior", () => {
    render(<ForbiddenState />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass(
      "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-card-alt",
      "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-primary",
      "motion-reduce:transition-none",
    );
  });

  it("invokes only its callback without submitting an enclosing form", () => {
    const action = vi.fn();
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={submit}><ForbiddenState actionLabel="Return safely" onAction={action} /></form>);
    const button = screen.getByRole("button", { name: "Return safely" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
