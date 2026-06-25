// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import AdvancedFilterBuilder, { FilterRule } from "../AdvancedFilterBuilder";

const mockFields = [
  { key: "full_name", label: "Employee Name", type: "string" as const },
  { key: "quantity", label: "Quantity", type: "number" as const },
  { key: "created_at", label: "Created Date", type: "date" as const },
  {
    key: "status",
    label: "Status",
    type: "select" as const,
    options: [
      { id: "active", label: "Active" },
      { id: "inactive", label: "Inactive" },
    ],
  },
];

describe("AdvancedFilterBuilder component", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders trigger button and count badge", () => {
    const rules: FilterRule[] = [
      { id: "r1", field: "full_name", operator: "contains", value: "Abebe" },
    ];
    render(
      <AdvancedFilterBuilder
        pageKey="test-page"
        fields={mockFields}
        rules={rules}
        logic="and"
        onChange={() => {}}
      />
    );

    expect(screen.getByText("Edit Filters")).toBeInTheDocument();
    expect(screen.getByText("1 Rules Applied")).toBeInTheDocument();
  });

  it("opens modal on trigger click and lists rules", async () => {
    const rules: FilterRule[] = [
      { id: "r1", field: "full_name", operator: "contains", value: "Abebe" },
    ];
    render(
      <AdvancedFilterBuilder
        pageKey="test-page"
        fields={mockFields}
        rules={rules}
        logic="and"
        onChange={() => {}}
      />
    );

    fireEvent.click(screen.getByText("Edit Filters"));
    
    expect(screen.getByText("Advanced Filters")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Value...")).toHaveValue("Abebe");
  });

  it("triggers onChange with rules and logic on Apply click", () => {
    const handleChange = vi.fn();
    const rules: FilterRule[] = [];
    render(
      <AdvancedFilterBuilder
        pageKey="test-page"
        fields={mockFields}
        rules={rules}
        logic="and"
        onChange={handleChange}
      />
    );

    // Open filter builder
    fireEvent.click(screen.getByText("Filters"));
    
    // Add rule
    fireEvent.click(screen.getByText("New Filtering Rule"));
    
    // Fill search value
    const input = screen.getByPlaceholderText("Value...");
    fireEvent.change(input, { target: { value: "Solomon" } });

    // Apply filters
    fireEvent.click(screen.getByText("Apply"));

    expect(handleChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          field: "full_name",
          operator: "contains",
          value: "Solomon",
        }),
      ]),
      "and"
    );
  });

  it("discards draft changes on Cancel click", () => {
    const handleChange = vi.fn();
    const rules: FilterRule[] = [];
    render(
      <AdvancedFilterBuilder
        pageKey="test-page"
        fields={mockFields}
        rules={rules}
        logic="and"
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByText("Filters"));
    fireEvent.click(screen.getByText("New Filtering Rule"));
    fireEvent.change(screen.getByPlaceholderText("Value..."), { target: { value: "Solomon" } });
    
    // Cancel
    fireEvent.click(screen.getByText("Cancel"));

    expect(handleChange).not.toHaveBeenCalled();
  });

  it("saves, loads and deletes named filter states in localStorage", async () => {
    const handleChange = vi.fn();
    const rules: FilterRule[] = [];
    const { rerender } = render(
      <AdvancedFilterBuilder
        pageKey="test-page"
        fields={mockFields}
        rules={rules}
        logic="and"
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByText("Filters"));
    fireEvent.click(screen.getByText("New Filtering Rule"));
    fireEvent.change(screen.getByPlaceholderText("Value..."), { target: { value: "Mamo" } });

    // Save named filter
    const saveInput = screen.getByPlaceholderText("Save current filters as...");
    fireEvent.change(saveInput, { target: { value: "Mamo Filter" } });
    fireEvent.click(screen.getByText("Save"));

    // Check localStorage has saved item
    const stored = JSON.parse(localStorage.getItem("saved_filters_test-page") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Mamo Filter");
    expect(stored[0].rules[0].value).toBe("Mamo");

    // Close and Reopen to verify list rendering
    fireEvent.click(screen.getByText("Cancel"));
    
    rerender(
      <AdvancedFilterBuilder
        pageKey="test-page"
        fields={mockFields}
        rules={rules}
        logic="and"
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByText("Filters"));
    expect(screen.getAllByText("Mamo Filter")[0]).toBeInTheDocument();

    // Delete saved filter
    fireEvent.click(screen.getByTitle("Delete Saved Filter"));
    expect(JSON.parse(localStorage.getItem("saved_filters_test-page") || "[]")).toHaveLength(0);
  });

  it("switches filter logic to OR before applying", () => {
    const handleChange = vi.fn();
    render(
      <AdvancedFilterBuilder
        pageKey="test-page"
        fields={mockFields}
        rules={[]}
        logic="and"
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByText("Filters"));
    fireEvent.click(screen.getByText("Or"));
    fireEvent.click(screen.getByText("Apply"));

    expect(handleChange).toHaveBeenCalledWith([], "or");
  });
});
