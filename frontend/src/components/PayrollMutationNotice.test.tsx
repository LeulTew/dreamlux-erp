import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PayrollMutationFailure } from "@/lib/payroll-error";
import PayrollMutationNotice from "./PayrollMutationNotice";

const language = vi.hoisted(() => ({ lang: "en" }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => language }));
afterEach(() => { cleanup(); language.lang = "en"; });

const unknownFailure: PayrollMutationFailure = { message: "Synthetic unknown outcome", needsReload: true };
const knownFailure: PayrollMutationFailure = { message: "Synthetic confirmed failure", needsReload: false };

describe("payroll recovery focus", () => {
  it("explains uncertainty without repeating the instruction or implying a rollback", () => {
    render(<PayrollMutationNotice pending={false} failure={unknownFailure} />);
    expect(screen.getByText("The change may already have been saved.")).toBeInTheDocument();
    expect(screen.queryByText(unknownFailure.message)).not.toBeInTheDocument();
    expect(screen.getByText("Reload and check payroll history before retrying. Further changes are blocked.")).toBeInTheDocument();
  });

  it("localizes the new uncertainty explanation and recovery action", () => {
    language.lang = "am";
    render(<PayrollMutationNotice pending={false} failure={unknownFailure} />);
    expect(screen.getByText("ለውጡ አስቀድሞ ተቀምጦ ሊሆን ይችላል።")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "የክፍያ ገጹን እንደገና ጫን" })).toHaveFocus();
  });

  it("focuses Reload payroll when the outcome first becomes unknown", () => {
    const { rerender } = render(<PayrollMutationNotice pending failure={null} />);
    rerender(<PayrollMutationNotice pending={false} failure={unknownFailure} />);
    expect(screen.getByRole("button", { name: "Reload payroll" })).toHaveFocus();
  });

  it("focuses recovery when entering another caller with a persistent unknown outcome", () => {
    const first = render(<PayrollMutationNotice pending={false} failure={unknownFailure} />);
    expect(screen.getByRole("button", { name: "Reload payroll" })).toHaveFocus();
    first.unmount();
    render(<PayrollMutationNotice pending={false} failure={unknownFailure} />);
    expect(screen.getByRole("button", { name: "Reload payroll" })).toHaveFocus();
  });

  it("does not move manual editing focus for a confirmed failure", () => {
    const { rerender } = render(<>
      <input aria-label="Manual payroll input" />
      <PayrollMutationNotice pending={false} failure={null} />
    </>);
    screen.getByRole("textbox", { name: "Manual payroll input" }).focus();
    rerender(<>
      <input aria-label="Manual payroll input" />
      <PayrollMutationNotice pending={false} failure={knownFailure} />
    </>);
    expect(screen.getByRole("textbox", { name: "Manual payroll input" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Reload payroll" })).not.toBeInTheDocument();
  });

  it("does not steal focus again on an unrelated rerender of the same unknown state", () => {
    const { rerender } = render(<>
      <input aria-label="Read-only inspection" />
      <PayrollMutationNotice pending={false} failure={unknownFailure} />
    </>);
    screen.getByRole("textbox", { name: "Read-only inspection" }).focus();
    rerender(<>
      <input aria-label="Read-only inspection" />
      <PayrollMutationNotice pending={false} failure={{ ...unknownFailure, message: "Still awaiting verification" }} />
    </>);
    expect(screen.getByRole("textbox", { name: "Read-only inspection" })).toHaveFocus();
  });
});
