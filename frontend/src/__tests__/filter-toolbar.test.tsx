import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterToolbar, ToolbarSearch } from "@/components/ui/FilterToolbar";

describe("FilterToolbar (issues #150 + follow-up)", () => {
  it("puts the search on its own full-width row above the filters", () => {
    render(
      <FilterToolbar search={<ToolbarSearch value="" onChange={() => {}} placeholder="Search..." />}>
        <span>filter-a</span>
      </FilterToolbar>,
    );
    const input = screen.getByPlaceholderText("Search...");
    const wrapper = input.parentElement as HTMLElement;
    expect(wrapper.className).toContain("w-full");
    // 44px touch target on the search field.
    expect(input.className).toContain("h-11");
    expect(screen.getByText("filter-a")).toBeTruthy();
  });

  it("shows an underlined Clear button only when filters are active", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <FilterToolbar showClear={false} onClear={onClear}>
        <span>f</span>
      </FilterToolbar>,
    );
    expect(screen.queryByText("Clear")).toBeNull();

    rerender(
      <FilterToolbar showClear onClear={onClear} clearLabel="Clear">
        <span>f</span>
      </FilterToolbar>,
    );
    const clear = screen.getByText("Clear");
    expect(clear.className).toContain("underline");
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalled();
  });

  it("emits changes from the search field", () => {
    const onChange = vi.fn();
    render(<ToolbarSearch value="" onChange={onChange} placeholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });
});
