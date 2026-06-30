import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const customMock = vi.fn(() => "custom-toast-id");
const successMock = vi.fn();
const errorMock = vi.fn();
const infoMock = vi.fn();
const dismissMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    custom: customMock,
    success: successMock,
    error: errorMock,
    info: infoMock,
    dismiss: dismissMock,
  },
}));

vi.mock("@/components/ui/PremiumToast", () => ({
  PremiumToast: ({ title, description, type }: { title: string; description?: string; type: string }) => (
    <div data-testid="premium-toast" data-type={type}>
      <span>{title}</span>
      {description ? <span>{description}</span> : null}
    </div>
  ),
}));

describe("toast compatibility helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes toast.success through PremiumToast custom rendering", async () => {
    const { default: toast } = await import("./toast");

    toast.success("Saved", "Record updated");

    expect(customMock).toHaveBeenCalledTimes(1);
    expect(successMock).not.toHaveBeenCalled();

    const renderFn = customMock.mock.calls[0][0] as (id: string) => React.ReactElement;
    const element = renderFn("toast-id") as React.ReactElement<{ children: React.ReactElement }>;
    const premiumToast = element.props.children as React.ReactElement<{
      title: string;
      description?: string;
      type: string;
    }>;

    expect(premiumToast.props.type).toBe("success");
    expect(premiumToast.props.title).toBe("Saved");
    expect(premiumToast.props.description).toBe("Record updated");
  });

  it("routes toast.error and toast.info through PremiumToast custom rendering", async () => {
    const { default: toast } = await import("./toast");

    toast.error("Failed");
    toast.info("Heads up");

    expect(customMock).toHaveBeenCalledTimes(2);
    expect(errorMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });
});
