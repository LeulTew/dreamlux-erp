// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SortableHeader } from "./SortableHeader";

describe("SortableHeader component", () => {
  it("renders label correctly", () => {
    render(
      <SortableHeader
        label="Test Column"
        sortKey="test"
        onSort={() => {}}
      />
    );
    expect(screen.getByRole("button")).toHaveTextContent("Test Column");
  });

  it("handles sorting click toggle from asc to desc", () => {
    const handleSort = vi.fn();
    render(
      <SortableHeader
        label="Test Column"
        sortKey="test"
        currentSortBy="test"
        currentSortOrder="asc"
        onSort={handleSort}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(handleSort).toHaveBeenCalledWith("test", "desc");
  });

  it("handles sorting click toggle from desc to asc", () => {
    const handleSort = vi.fn();
    render(
      <SortableHeader
        label="Test Column"
        sortKey="test"
        currentSortBy="test"
        currentSortOrder="desc"
        onSort={handleSort}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(handleSort).toHaveBeenCalledWith("test", "asc");
  });

  it("defaults to asc order when sorting an inactive column", () => {
    const handleSort = vi.fn();
    render(
      <SortableHeader
        label="Test Column"
        sortKey="test"
        currentSortBy="other_field"
        currentSortOrder="desc"
        onSort={handleSort}
      />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(handleSort).toHaveBeenCalledWith("test", "asc");
  });

  it("sets correct accessibility labels (aria-label) based on sort state", () => {
    const { rerender } = render(
      <SortableHeader
        label="Test Column"
        sortKey="test"
        currentSortBy="test"
        currentSortOrder="asc"
        onSort={() => {}}
      />
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Sorted by Test Column ascending. Click to sort descending."
    );

    rerender(
      <SortableHeader
        label="Test Column"
        sortKey="test"
        currentSortBy="test"
        currentSortOrder="desc"
        onSort={() => {}}
      />
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Sorted by Test Column descending. Click to sort ascending."
    );

    rerender(
      <SortableHeader
        label="Test Column"
        sortKey="test"
        currentSortBy="other"
        currentSortOrder="asc"
        onSort={() => {}}
      />
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Not sorted by Test Column. Click to sort ascending."
    );
  });
});
