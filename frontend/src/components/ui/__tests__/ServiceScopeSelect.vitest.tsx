/** @vitest-environment jsdom */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";
import { ServiceScopeSelect } from "../ServiceScopeSelect";
import { ServiceScope } from "@/lib/types";
import * as api from "@/lib/api";

const mockLanguageState = { lang: "en" };

vi.mock("@/lib/api", () => ({
  getServiceScopes: vi.fn(),
}));

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ lang: mockLanguageState.lang, toggle: vi.fn() }),
}));

const mockScopes: ServiceScope[] = [
  {
    id: "scope-1",
    code: "FULL",
    name_en: "Full Event Management",
    name_am: "ሙሉ የዝግጅት ማኔጅመንት",
    description: "End-to-end planning, stage design, vendor management, and execution.",
    display_order: 1,
    is_active: true,
  },
  {
    id: "scope-2",
    code: "BACKGROUND",
    name_en: "Background Setup Only",
    name_am: "የጀርባ ዲዛይን እና ዝግጅት ብቻ",
    description: "Stage backdrops, lighting rigging, structural frame setup.",
    display_order: 2,
    is_active: true,
  },
  {
    id: "scope-3",
    code: "SETUP",
    name_en: "Setup & Logistics",
    name_am: "የዝግጅት ዕቃዎች ዝግጅት እና ትራንስፖርት",
    description: "Material transport, unloading, spatial positioning.",
    display_order: 3,
    is_active: true,
  },
];

describe("ServiceScopeSelect Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLanguageState.lang = "en";
    vi.mocked(api.getServiceScopes).mockResolvedValue({
      service_scopes: mockScopes,
    });
  });

  it("renders trigger button with 48px min-height and English placeholder", async () => {
    render(
      <ServiceScopeSelect
        selectedIds={[]}
        onChange={vi.fn()}
        scopes={mockScopes}
      />
    );

    const combobox = screen.getByRole("combobox");
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveClass("min-h-[48px]");
    expect(screen.getByText("Select Service Scopes...")).toBeInTheDocument();
  });

  it("renders Amharic scope names and Amharic labels when lang is set to am", () => {
    mockLanguageState.lang = "am";
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1", "scope-2"]}
        onChange={vi.fn()}
        scopes={mockScopes}
      />
    );

    expect(screen.getByText("ሙሉ የዝግጅት ማኔጅመንት")).toBeInTheDocument();
    expect(screen.getByText("የጀርባ ዲዛይን እና ዝግጅት ብቻ")).toBeInTheDocument();
  });

  it("displays selected scopes as badges with 48px remove button target", () => {
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1"]}
        onChange={vi.fn()}
        scopes={mockScopes}
      />
    );

    expect(screen.getByText("Full Event Management")).toBeInTheDocument();
    const removeButton = screen.getByRole("button", { name: /Remove/i });
    expect(removeButton).toHaveClass("min-h-[48px]");
    expect(removeButton).toHaveClass("min-w-[48px]");
  });

  it("opens dropdown and toggles scope selection on click", async () => {
    const onChangeMock = vi.fn();
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1"]}
        onChange={onChangeMock}
        scopes={mockScopes}
      />
    );

    const combobox = screen.getByRole("combobox");
    fireEvent.click(combobox);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);

    // Click third option (Setup & Logistics)
    fireEvent.click(options[2]);
    expect(onChangeMock).toHaveBeenCalledWith(["scope-1", "scope-3"]);
  });

  it("deselects scope when clicking remove button on badge", () => {
    const onChangeMock = vi.fn();
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1", "scope-2"]}
        onChange={onChangeMock}
        scopes={mockScopes}
      />
    );

    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    fireEvent.click(removeButtons[0]);

    expect(onChangeMock).toHaveBeenCalledWith(["scope-2"]);
  });

  it("supports keyboard navigation with ArrowDown, ArrowUp, Enter, and Escape", () => {
    const onChangeMock = vi.fn();
    render(
      <ServiceScopeSelect
        selectedIds={[]}
        onChange={onChangeMock}
        scopes={mockScopes}
      />
    );

    const combobox = screen.getByRole("combobox");
    
    // Press ArrowDown to open dropdown and focus first item
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Press ArrowDown to move to second item
    fireEvent.keyDown(combobox, { key: "ArrowDown" });

    // Press Enter to select second item
    fireEvent.keyDown(combobox, { key: "Enter" });
    expect(onChangeMock).toHaveBeenCalledWith(["scope-2"]);

    // Press Escape to close dropdown
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders error state with 48px retry button on API failure", async () => {
    vi.mocked(api.getServiceScopes).mockRejectedValue(new Error("Network Error"));

    render(
      <ServiceScopeSelect
        selectedIds={[]}
        onChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Network Error")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", { name: /Retry/i });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toHaveClass("min-h-[48px]");
    expect(retryButton).toHaveClass("min-w-[48px]");
  });
});
