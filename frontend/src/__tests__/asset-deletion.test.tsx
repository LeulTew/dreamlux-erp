import React from "react";
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssetsTrash from "@/app/assets/trash/page";
import { getItems, permanentlyDeleteItem } from "@/lib/api";
import toast from "@/lib/toast";

let grants = new Set<string>();
let language = "en";
const clients: QueryClient[] = [];
vi.mock("@/lib/api", () => ({
  getItems: vi.fn(), getStores: vi.fn().mockResolvedValue([]),
  recoverItem: vi.fn(), permanentlyDeleteItem: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/AuthLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, hasPermission: (slug: string) => grants.has(slug) }),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: language }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const itemId = "25900000-abcd-4259-8259-000000000001";
const receipt = { success: true, permanently_deleted: true } as const;
const conflict = (code: string) => ({
  isAxiosError: true,
  response: { status: 409, data: { code, error: "Do not display raw service internals" } },
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 1 } },
  });
  clients.push(client);
  const tree = () => <QueryClientProvider client={client}><AssetsTrash /></QueryClientProvider>;
  const view = render(tree());
  return { ...view, refresh: () => view.rerender(tree()) };
}

async function openConfirmation() {
  const title = language === "am" ? "በቋሚነት ሰርዝ" : "Permanent Delete";
  const opener = (await screen.findAllByRole("button", { name: title }))[0];
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: title });
  return { dialog, opener };
}

async function confirm() {
  const { dialog } = await openConfirmation();
  fireEvent.click(within(dialog).getByRole("button", {
    name: language === "am" ? "መሰረዝን አረጋግጥ" : "Confirm Delete",
  }));
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  grants = new Set(["assets:read", "assets:delete"]);
  language = "en";
  onlineManager.setOnline(true);
  vi.mocked(getItems).mockReset().mockResolvedValue({
    items: [{
      id: itemId, name: "Synthetic retained equipment", quantity: 10, description: null,
      store: { id: "25900000-abcd-4259-8259-000000000002", name: "Synthetic store" },
      image_url: null, last_counted_at: null, last_counted_by: null,
      created_at: "2030-01-15T00:00:00Z", updated_at: "2030-01-15T00:00:00Z",
    }],
    total: 1, page: 1, limit: 10,
  });
  vi.mocked(permanentlyDeleteItem).mockReset().mockResolvedValue(receipt);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
});

describe("permanent asset deletion recovery", () => {
  it("retains ordinary successful deletion and refreshes the trash list", async () => {
    mount();
    await confirm();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Item permanently deleted"));
    expect(permanentlyDeleteItem).toHaveBeenCalledWith(itemId);
    await waitFor(() => expect(getItems).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps a history conflict in the dialog without removing the record or retrying", async () => {
    vi.mocked(permanentlyDeleteItem).mockRejectedValue(conflict("ITEM_HAS_HISTORY"));
    const view = mount();
    const dialog = await confirm();
    const notice = await within(dialog).findByRole("alert");
    expect(notice).toHaveTextContent("This item has operational history and cannot be permanently deleted.");
    expect(notice).not.toHaveTextContent("service internals");
    expect(screen.getAllByText("Synthetic retained equipment").length).toBeGreaterThan(1);
    expect(permanentlyDeleteItem).toHaveBeenCalledTimes(1);
    expect(getItems).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    language = "am";
    view.refresh();
    expect(notice).toHaveTextContent("የሥራ ታሪክ");
    expect(within(dialog).getByRole("button", { name: "መሰረዝን አረጋግጥ" })).toBeInTheDocument();
  });

  it.each([
    ["ITEM_NOT_TRASHED", "Move the item to trash"],
    ["ITEM_DELETE_BUSY", "This item is being changed"],
    ["ITEM_DELETE_UNCONFIRMED", "Item deletion could not be confirmed"],
    ["ITEM_NOT_FOUND", "This item no longer exists"],
    ["constructor", "Permanent delete failed"],
  ])("renders stable %s recovery without exposing raw server details", async (code, expected) => {
    vi.mocked(permanentlyDeleteItem).mockRejectedValue(conflict(code));
    mount();
    const dialog = await confirm();
    const notice = await within(dialog).findByRole("alert");
    expect(notice).toHaveTextContent(expected);
    expect(notice).not.toHaveTextContent("service internals");
    expect(permanentlyDeleteItem).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("localizes the unknown-commit recovery rather than suggesting a successful deletion", async () => {
    language = "am";
    vi.mocked(permanentlyDeleteItem).mockRejectedValue(conflict("ITEM_DELETE_UNCONFIRMED"));
    mount();
    const dialog = await confirm();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("እቃው መሰረዙን ማረጋገጥ አልተቻለም");
    expect(toast.success).not.toHaveBeenCalled();
    expect(permanentlyDeleteItem).toHaveBeenCalledTimes(1);
  });

  it("distinguishes confirmed deletion from image-cleanup follow-up", async () => {
    vi.mocked(permanentlyDeleteItem).mockResolvedValue({ ...receipt, storage_cleanup_pending: true });
    mount();
    await confirm();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Item deleted. Image cleanup needs administrator follow-up."));
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(getItems).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not show permanent-delete controls to a read-only actor", async () => {
    grants.delete("assets:delete");
    mount();
    await screen.findAllByText("Synthetic retained equipment");
    expect(screen.queryAllByRole("button", { name: "Permanent Delete" })).toHaveLength(0);
    expect(permanentlyDeleteItem).not.toHaveBeenCalled();
  });

  it("rechecks current authority while the confirmation is open", async () => {
    const view = mount();
    const { dialog } = await openConfirmation();
    grants.delete("assets:delete");
    view.refresh();
    expect(within(dialog).queryByRole("button", { name: "Confirm Delete" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(permanentlyDeleteItem).not.toHaveBeenCalled();
  });

  it("does not queue a destructive offline request for reconnection", async () => {
    vi.mocked(permanentlyDeleteItem).mockRejectedValue(new Error("Synthetic offline"));
    mount();
    await screen.findAllByText("Synthetic retained equipment");
    act(() => onlineManager.setOnline(false));
    const dialog = await confirm();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Permanent delete failed");
    await act(async () => { onlineManager.setOnline(true); });
    expect(permanentlyDeleteItem).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing pending dismissal guard and suppresses duplicate confirmation", async () => {
    let finish!: (value: Awaited<ReturnType<typeof permanentlyDeleteItem>>) => void;
    vi.mocked(permanentlyDeleteItem).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mount();
    const dialog = await confirm();
    const pending = await within(dialog).findByRole("button", { name: "Deleting..." });
    expect(pending).toBeDisabled();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(pending).toHaveClass("min-h-12", "bg-danger", "text-background");
    expect(pending).not.toHaveClass("disabled:opacity-50");
    fireEvent.click(pending);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close confirmation" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(permanentlyDeleteItem).toHaveBeenCalledTimes(1);
    await act(async () => { finish(receipt); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("allows cancellation after a conflict, restores focus, and clears the old failure on reopening", async () => {
    vi.mocked(permanentlyDeleteItem).mockRejectedValue(conflict("ITEM_HAS_HISTORY"));
    mount();
    const { dialog, opener } = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Delete" }));
    await within(dialog).findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    fireEvent.click(opener);
    const reopened = await screen.findByRole("dialog");
    expect(within(reopened).queryByRole("alert")).not.toBeInTheDocument();
    expect(permanentlyDeleteItem).toHaveBeenCalledTimes(1);
  });

  it("uses the existing contrast tokens and 48px minimums on both changed row controls", async () => {
    mount();
    const controls = await screen.findAllByRole("button", { name: "Permanent Delete" });
    expect(controls).toHaveLength(2);
    for (const button of controls) {
      expect(button).toHaveClass("min-h-12", "min-w-12", "bg-danger", "text-background");
      expect(button).not.toHaveClass("text-white", "disabled:opacity-50");
    }
  });
});
