import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Button, buttonVariants } from "@/components/ui/button";

// Issue #151: the canonical filled amber/orange action must use a WHITE
// foreground (text + icons) in both themes, with a crisp hover and a clean
// focus ring — no gradient, glow, blur, or oversized shadow.

describe("canonical amber button variant (issue #151)", () => {
  const cls = buttonVariants({ variant: "amber" });

  it("uses a solid amber fill with white text in both themes", () => {
    expect(cls).toContain("bg-amber-600");
    expect(cls).toContain("text-white");
    expect(cls).toContain("dark:bg-amber-500");
    expect(cls).toContain("dark:text-white");
  });

  it("makes icons inherit the white foreground", () => {
    expect(cls).toContain("[&_svg]:text-white");
  });

  it("has a crisp darker-on-hover state and a focus ring, without glow/blur/gradient/oversized shadow", () => {
    expect(cls).toContain("hover:bg-amber-700");
    expect(cls).toContain("focus-visible:ring-amber-500/40");
    expect(cls).not.toMatch(/blur|shadow-amber|bg-gradient|from-amber/);
  });

  it("renders a real button carrying the amber fill + white text classes", () => {
    const { getByRole } = render(<Button variant="amber">Save</Button>);
    const el = getByRole("button");
    expect(el.className).toContain("bg-amber-600");
    expect(el.className).toContain("text-white");
  });
});
