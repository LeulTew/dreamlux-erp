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

/**
 * Authoritative seed catalog — matches event_service_scopes.sql exactly:
 *   ('FULL',        'Full',        'ሙሉ',           1)
 *   ('BACKGROUND',  'Background',  'ባክግራውንድ',     2)
 *   ('SETUP',       'Setup',       'ሴታፕ',          3)
 *   ('TABLE_SETUP', 'Table Setup', 'ጠረጴዛ ሴታፕ',    4)
 */
const mockScopes: ServiceScope[] = [
  {
    id: "scope-1",
    code: "FULL",
    name_en: "Full",
    name_am: "ሙሉ",
    description: "End-to-end planning, stage design, vendor management, and execution.",
    display_order: 1,
    is_active: true,
  },
  {
    id: "scope-2",
    code: "BACKGROUND",
    name_en: "Background",
    name_am: "ባክግራውንድ",
    description: "Stage backdrops, lighting rigging, structural frame setup.",
    display_order: 2,
    is_active: true,
  },
  {
    id: "scope-3",
    code: "SETUP",
    name_en: "Setup",
    name_am: "ሴታፕ",
    description: "Material transport, unloading, spatial positioning.",
    display_order: 3,
    is_active: true,
  },
  {
    id: "scope-4",
    code: "TABLE_SETUP",
    name_en: "Table Setup",
    name_am: "ጠረጴዛ ሴታፕ",
    description: "Table arrangement, linen, and centerpiece positioning.",
    display_order: 4,
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

  it("renders authoritative English scope names from the migration catalog", () => {
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1", "scope-2", "scope-3", "scope-4"]}
        onChange={vi.fn()}
        scopes={mockScopes}
      />
    );

    expect(screen.getByText("Full")).toBeInTheDocument();
    expect(screen.getByText("Background")).toBeInTheDocument();
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Table Setup")).toBeInTheDocument();
  });

  it("renders authoritative Amharic scope names when lang is am", () => {
    mockLanguageState.lang = "am";
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1", "scope-2", "scope-3", "scope-4"]}
        onChange={vi.fn()}
        scopes={mockScopes}
      />
    );

    expect(screen.getByText("ሙሉ")).toBeInTheDocument();
    expect(screen.getByText("ባክግራውንድ")).toBeInTheDocument();
    expect(screen.getByText("ሴታፕ")).toBeInTheDocument();
    expect(screen.getByText("ጠረጴዛ ሴታፕ")).toBeInTheDocument();
  });

  it("displays selected scopes as badges with 48px remove button target", () => {
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1"]}
        onChange={vi.fn()}
        scopes={mockScopes}
      />
    );

    expect(screen.getByText("Full")).toBeInTheDocument();
    const removeButton = screen.getByRole("button", { name: /Remove/i });
    expect(removeButton).toHaveClass("min-h-[48px]");
    expect(removeButton).toHaveClass("min-w-[48px]");
  });

  it("opens dropdown showing all 4 authoritative scopes and toggles selection on click", async () => {
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
    expect(options).toHaveLength(4);

    // Click fourth option (Table Setup) — authoritative TABLE_SETUP scope
    fireEvent.click(options[3]);
    expect(onChangeMock).toHaveBeenCalledWith(["scope-1", "scope-4"]);
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

    // Press Enter to select second item (Background)
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

  it("isolates hover styles behind md: modifier for mobile touch safety", () => {
    render(
      <ServiceScopeSelect
        selectedIds={["scope-1"]}
        onChange={vi.fn()}
        scopes={mockScopes}
      />
    );

    const combobox = screen.getByRole("combobox");
    const classList = combobox.className;

    // Verify no bare hover: class — all hover should be behind md:hover:
    expect(classList).not.toMatch(/(?<!\bmd:)hover:/);
  });

  it("service scopes are independent from event category/type", () => {
    // Scopes have their own catalog table (event_service_scopes) and junction
    // tables (proposal_service_scopes, event_service_scope_links), entirely
    // separate from event_types. Verify the component operates without any
    // event_type_id or category prop.
    const onChangeMock = vi.fn();
    render(
      <ServiceScopeSelect
        selectedIds={[]}
        onChange={onChangeMock}
        scopes={mockScopes}
      />
    );

    const combobox = screen.getByRole("combobox");
    fireEvent.click(combobox);
    const options = screen.getAllByRole("option");
    // All 4 scopes are available regardless of any event category
    expect(options).toHaveLength(4);
    fireEvent.click(options[0]);
    expect(onChangeMock).toHaveBeenCalledWith(["scope-1"]);
  });
});
