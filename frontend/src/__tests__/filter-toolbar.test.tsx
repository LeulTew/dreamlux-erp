import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterToolbar, ToolbarSearch } from "@/components/ui/FilterToolbar";

describe("FilterToolbar (issue #150)", () => {
  it("renders its children in a wrapping row container", () => {
    render(
      <FilterToolbar>
        <span>child-a</span>
        <span>child-b</span>
      </FilterToolbar>,
    );
    expect(screen.getByText("child-a")).toBeTruthy();
    expect(screen.getByText("child-b")).toBeTruthy();
  });

  it("bounds the search width on desktop so it never dominates the row", () => {
    render(<ToolbarSearch value="" onChange={() => {}} placeholder="Search..." />);
    const input = screen.getByPlaceholderText("Search...");
    const wrapper = input.parentElement as HTMLElement;
    // Full width on mobile, capped on desktop.
    expect(wrapper.className).toContain("w-full");
    expect(wrapper.className).toMatch(/sm:w-\d+/);
    expect(wrapper.className).toMatch(/lg:w-\d+/);
    // 44px touch target.
    expect(input.className).toContain("h-11");
  });

  it("emits changes from the search field", () => {
    const onChange = vi.fn();
    render(<ToolbarSearch value="" onChange={onChange} placeholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });
});
