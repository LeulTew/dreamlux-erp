import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConditionStock } from "./ConditionStock";
import { assertConditionActor, getConditionAuthority, getConditionItem, getConditionStock, submitConditionResolution } from "@/lib/condition-stock-api";
import { ConditionAccessChanged, ConditionContractError } from "@/lib/condition-stock";
import { invalidateInventoryState } from "@/lib/inventory-cache";
import { conditionStockCopy } from "@/lib/condition-stock-copy";
import { conditionActor, conditionDetail, conditionIntent, conditionItem, conditionReceipt } from "@/__tests__/helpers/condition-stock";
import { conditionStorageKey } from "@/lib/condition-resolution-store";

let permissions = new Set<string>();
let language = "en";
let actorId: string | undefined = conditionActor;
const params = new URLSearchParams();
const clients: QueryClient[] = [];
vi.mock("next/navigation", () => ({ useSearchParams: () => params, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: language }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: actorId }, isAuthenticated: true, isLoading: false,
  hasPermission: (slug: string) => permissions.has(slug),
}) }));
vi.mock("@/lib/condition-stock-api", () => ({
  assertConditionActor: vi.fn(), getConditionAuthority: vi.fn(), getConditionItem: vi.fn(), getConditionStock: vi.fn(), submitConditionResolution: vi.fn(),
}));
vi.mock("@/lib/inventory-cache", () => ({ invalidateInventoryState: vi.fn().mockResolvedValue(undefined) }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><ConditionStock /></QueryClientProvider>);
}
async function dialog() {
  const result = await screen.findByRole("dialog", { name: conditionStockCopy(language).title });
  await within(result).findByRole("heading", { name: conditionItem.name });
  return within(result);
}
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  permissions = new Set(["assets:read", "assets:reconcile"]);
  actorId = conditionActor;
  language = "en";
  params.set("item", conditionItem.id);
  vi.mocked(getConditionStock).mockResolvedValue({ items: [conditionItem], next_cursor: null });
  vi.mocked(getConditionItem).mockResolvedValue({ ...conditionDetail, history: [] });
  vi.mocked(assertConditionActor).mockResolvedValue(undefined);
  vi.mocked(getConditionAuthority).mockImplementation(async () => ({
    actorId: conditionActor,
    canRead: permissions.has("assets:read") || permissions.has("assets:reconcile"),
    canResolve: permissions.has("assets:reconcile"),
    canReadMovements: permissions.has("assets:read"),
  }));
  vi.mocked(invalidateInventoryState).mockResolvedValue(undefined);
  vi.mocked(submitConditionResolution).mockImplementation(async (intent) => ({
    ...conditionReceipt, ...intent.payload, created_by: intent.actor_id, item_id: intent.item_id,
  }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); });

describe("condition-stock operator interface", () => {
  it("keeps a case-equivalent deep link attached to its actual item and saved outcome", async () => {
    const item = { ...conditionItem, id: "abcdefab-cdef-4abc-8def-abcdefabcdef" };
    params.set("item", item.id.toUpperCase());
    vi.mocked(getConditionItem).mockResolvedValue({ item, history: [], next_cursor: null, recovery: null });
    mount();
    const detail = await dialog();
    expect(getConditionItem).toHaveBeenCalledWith(conditionActor, item.id, expect.any(Object));
    fireEvent.change(detail.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.click(detail.getByRole("button", { name: "Record resolution" }));
    expect(await detail.findByText("Resolution recorded", { exact: true })).toBeVisible();
    expect(vi.mocked(submitConditionResolution).mock.calls[0][0].item_id).toBe(item.id);
    expect(detail.queryByText(conditionStockCopy("en").activeRequest)).toBeNull();
  });

  it.each([
    { lang: "en", unit: "Unit", reference: "Item reference" },
    { lang: "am", unit: "መለኪያ", reference: "የዕቃ መለያ" },
  ])("shows distinct authoritative context for same-name items in $lang", async ({ lang, unit, reference }) => {
    language = lang;
    params.delete("item");
    const east = { ...conditionItem, store_id: conditionActor, store_name: "East warehouse", store_is_active: true };
    const west = { ...conditionItem, id: conditionReceipt.id, unit_of_measurement: "sets",
      store_id: conditionReceipt.id, store_name: "West warehouse", store_is_active: false };
    vi.mocked(getConditionStock).mockResolvedValue({ items: [east, west], next_cursor: null });
    vi.mocked(getConditionItem).mockResolvedValue({ ...conditionDetail, item: west, history: [] });
    mount();
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("East warehouse", { exact: false })).toBeVisible();
    expect(within(rows[1]).getByText("West warehouse", { exact: false })).toBeVisible();
    expect(within(rows[1]).getByText(`${unit}: sets`, { exact: false })).toBeVisible();
    expect(within(rows[1]).getByText(west.id)).toBeVisible();
    expect(rows[0].textContent).not.toBe(rows[1].textContent);
    fireEvent.click(within(rows[1]).getByRole("button"));
    const detail = await dialog();
    expect(detail.getByText("West warehouse", { exact: false })).toBeVisible();
    expect(detail.getByText(`${unit}: sets`, { exact: false })).toBeVisible();
    expect(detail.getByText(`${reference}:`, { exact: false })).toBeVisible();
    expect(detail.getByText(west.id)).toBeVisible();
    fireEvent.change(detail.getByLabelText(conditionStockCopy(lang).quantity), { target: { value: "1" } });
    fireEvent.click(detail.getByRole("button", { name: conditionStockCopy(lang).resolve }));
    await waitFor(() => expect(submitConditionResolution).toHaveBeenCalledOnce());
    expect(vi.mocked(submitConditionResolution).mock.calls[0][0].item_id).toBe(west.id);
  });

  it.each(["en", "am"])("shows authoritative balances, all outcomes and explicit empty history in %s", async (lang) => {
    language = lang;
    const copy = conditionStockCopy(lang);
    mount();
    const detail = await dialog();
    expect(detail.getByText("20", { exact: true })).toBeVisible();
    expect(detail.getByText("5", { exact: true })).toBeVisible();
    expect(detail.getByText("4", { exact: true })).toBeVisible();
    expect(detail.getByText(copy.historyEmpty)).toBeVisible();
    expect(within(detail.getByLabelText(copy.source)).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["damaged", "repair"]);
    expect(within(detail.getByLabelText(copy.outcome)).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["good", "damaged", "repair", "lost"]);
  });

  it("admits no reads or actions without a current capability", async () => {
    permissions.clear();
    mount();
    expect(await screen.findByText(conditionStockCopy("en").forbidden)).toBeVisible();
    expect(getConditionStock).not.toHaveBeenCalled();
    expect(getConditionItem).not.toHaveBeenCalled();
  });

  it.each(["en", "am"])("does not shift an unknown historical clock into the browser timezone in %s", async (lang) => {
    language = lang;
    const original = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      return new original(locales, { ...options, timeZone: options?.timeZone ?? "Africa/Addis_Ababa" });
    });
    const receipt = { ...conditionReceipt, created_at: "2031-11-02T05:30:00.123456Z" };
    vi.mocked(getConditionItem).mockResolvedValue({ ...conditionDetail, history: [receipt] });
    mount();
    const detail = await dialog();
    const locale = lang === "am" ? "am-ET" : "en-ET";
    expect(detail.getByText(new original(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
      .format(new Date(receipt.created_at)))).toBeVisible();
    expect(detail.getByText(conditionStockCopy(lang).historicalTime)).toBeVisible();
  });

  it("does not create a journal or read stock for an identity-less legacy session", async () => {
    actorId = undefined;
    vi.mocked(getConditionAuthority).mockRejectedValue(new ConditionAccessChanged());
    mount();
    expect(await screen.findByText(conditionStockCopy("en").identityUnavailable)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeVisible();
    expect(getConditionStock).not.toHaveBeenCalled();
    expect(getConditionItem).not.toHaveBeenCalled();
    expect(submitConditionResolution).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("lets asset readers inspect without any write action", async () => {
    permissions.delete("assets:reconcile");
    mount();
    const detail = await dialog();
    expect(detail.getByText(conditionStockCopy("en").readOnly)).toBeVisible();
    expect(detail.queryByRole("button", { name: "Record resolution" })).toBeNull();
    expect(detail.getByLabelText("Quantity")).toBeDisabled();
    expect(submitConditionResolution).not.toHaveBeenCalled();
  });

  it("allows reconciliation-only inspection without exposing other inventory grants", async () => {
    permissions.delete("assets:read");
    mount();
    const detail = await dialog();
    expect(detail.getByRole("button", { name: "Record resolution" })).toBeVisible();
    expect(detail.queryByRole("link", { name: "View stock movements" })).toBeNull();
  });

  it("does not render failure or missing balances as an empty ledger", async () => {
    vi.mocked(getConditionItem).mockRejectedValue(new ConditionContractError());
    mount();
    expect(await screen.findByText(conditionStockCopy("en").unavailable)).toBeVisible();
    expect(screen.queryByText(conditionStockCopy("en").historyEmpty)).toBeNull();
    expect(screen.queryByRole("button", { name: "Record resolution" })).toBeNull();
  });

  it("shows archived history without offering new writes", async () => {
    vi.mocked(getConditionItem).mockResolvedValue({ ...conditionDetail, item: { ...conditionItem, deleted_at: "2026-09-22T00:00:00Z" } });
    mount();
    const detail = await dialog();
    expect(detail.getByText(conditionStockCopy("en").archivedHelp)).toBeVisible();
    expect(detail.getByText("Inspected safely")).toBeVisible();
    expect(detail.queryByRole("button", { name: "Record resolution" })).toBeNull();
  });

  it.each(["en", "am"])("keeps missing units and inactive archived-location context explicit in %s", async (lang) => {
    language = lang;
    const copy = conditionStockCopy(lang);
    const retained = { ...conditionItem, store_id: conditionActor, store_name: "Retained warehouse",
      store_is_active: false, unit_of_measurement: null, deleted_at: "2026-09-22T00:00:00Z" };
    vi.mocked(getConditionItem).mockResolvedValue({ ...conditionDetail, item: retained });
    mount();
    const detail = await dialog();
    expect(detail.getByText(copy.archivedHelp)).toBeVisible();
    expect(detail.getByText(copy.inactiveLocation)).toBeVisible();
    expect(detail.getByText(`${copy.unit}: ${copy.notRecorded}`)).toBeVisible();
    expect(detail.getByText(retained.id)).toBeVisible();
    expect(detail.queryByRole("button", { name: copy.resolve })).toBeNull();
    expect(detail.queryByText(`${copy.unit}: pcs`)).toBeNull();
  });

  it("can finish acknowledged archived recovery without blocking another active item or reopening archived writes", async () => {
    sessionStorage.setItem(conditionStorageKey(conditionActor), JSON.stringify({
      version: 1, intent: conditionIntent, status: "unknown", receipt: null,
    }));
    vi.mocked(getConditionItem).mockResolvedValue({ ...conditionDetail, recovery: conditionReceipt,
      item: { ...conditionItem, deleted_at: "2026-09-22T00:00:00Z" } });
    mount();
    const detail = await dialog();
    expect(detail.queryByRole("button", { name: "Retry exact request" })).toBeNull();
    fireEvent.click(detail.getByRole("button", { name: "Check saved outcome" }));
    fireEvent.click(await detail.findByRole("button", { name: "Finish request review" }));
    expect(sessionStorage.getItem(conditionStorageKey(conditionActor))).toBeNull();
    expect(detail.queryByRole("button", { name: "Record resolution" })).toBeNull();
    expect(submitConditionResolution).not.toHaveBeenCalled();
  });

  it("requires a bounded positive integer and preserves same-condition inspection", async () => {
    mount();
    const detail = await dialog();
    for (const input of ["", "0", "-1", "1.5", "6", "1000001"]) {
      fireEvent.change(detail.getByLabelText("Quantity"), { target: { value: input } });
      expect(detail.getByRole("button", { name: "Record resolution" })).toBeDisabled();
    }
    fireEvent.change(detail.getByLabelText("Outcome"), { target: { value: "damaged" } });
    fireEvent.change(detail.getByLabelText("Quantity"), { target: { value: "2" } });
    expect(detail.getByText(conditionStockCopy("en").sameCondition)).toBeVisible();
    expect(detail.getByRole("button", { name: "Record resolution" })).toBeEnabled();
  });

  it("preserves authored inputs after rejection and returns them to editing only deliberately", async () => {
    vi.mocked(submitConditionResolution).mockRejectedValue({ response: { status: 409 } });
    mount();
    const detail = await dialog();
    fireEvent.change(detail.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.change(detail.getByLabelText("Inspection notes"), { target: { value: "  Do not lose this note  " } });
    fireEvent.click(detail.getByRole("button", { name: "Record resolution" }));
    await detail.findByText(conditionStockCopy("en").conflict);
    expect(detail.getByLabelText("Quantity")).toHaveValue("2");
    expect(detail.getByLabelText("Inspection notes")).toHaveValue("  Do not lose this note  ");
    fireEvent.click(detail.getByRole("button", { name: "Edit rejected request" }));
    expect(detail.getByLabelText("Inspection notes")).toBeEnabled();
    expect(detail.getByLabelText("Inspection notes")).toHaveValue("  Do not lose this note  ");
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
  });

  it("retains an unknown request across reload and does not accept refreshed empty history as success", async () => {
    vi.mocked(submitConditionResolution).mockRejectedValue(new ConditionContractError());
    const first = mount();
    const detail = await dialog();
    fireEvent.change(detail.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.click(detail.getByRole("button", { name: "Record resolution" }));
    await detail.findByRole("button", { name: "Retry exact request" });
    const intent = vi.mocked(submitConditionResolution).mock.calls[0][0];
    first.unmount();
    mount();
    const restored = await dialog();
    expect(restored.getByText(conditionStockCopy("en").unknown)).toBeVisible();
    expect(restored.getByLabelText("Quantity")).toHaveValue("2");
    fireEvent.click(restored.getByRole("button", { name: "Check saved outcome" }));
    expect(await restored.findByText(conditionStockCopy("en").noRecord)).toBeVisible();
    expect(restored.queryByRole("button", { name: "Start another resolution" })).toBeNull();
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
    vi.mocked(getConditionItem).mockResolvedValue({ ...conditionDetail, recovery: { ...conditionReceipt, ...intent.payload } });
    fireEvent.click(restored.getByRole("button", { name: "Check saved outcome" }));
    expect(await restored.findByText("Resolution recorded", { exact: true })).toBeVisible();
  });

  it("requires explicit safe loss confirmation and returns focus after cancel", async () => {
    mount();
    const detail = await dialog();
    fireEvent.change(detail.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.change(detail.getByLabelText("Outcome"), { target: { value: "lost" } });
    const submit = detail.getByRole("button", { name: "Record resolution" });
    submit.focus();
    fireEvent.click(submit);
    const confirm = within(await screen.findByRole("dialog", { name: "Confirm equipment loss" }));
    expect(submitConditionResolution).not.toHaveBeenCalled();
    fireEvent.click(confirm.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(submit).toHaveFocus());
    fireEvent.click(submit);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Confirm equipment loss" })).getByRole("button", { name: "Confirm loss" }));
    await detail.findByText("Resolution recorded", { exact: true });
    expect(submitConditionResolution).toHaveBeenCalledTimes(1);
    expect(vi.mocked(submitConditionResolution).mock.calls[0][0].payload).toMatchObject({ outcome: "lost", quantity: 1 });
  });

  it("shows protected storage failure inside the sheet and sends nothing", async () => {
    mount();
    const detail = await dialog();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
    fireEvent.change(detail.getByLabelText("Quantity"), { target: { value: "1" } });
    fireEvent.click(detail.getByRole("button", { name: "Record resolution" }));
    expect(await detail.findByText(conditionStockCopy("en").storage)).toBeVisible();
    expect(detail.getByLabelText("Quantity")).toHaveValue("1");
    expect(assertConditionActor).not.toHaveBeenCalled();
    expect(submitConditionResolution).not.toHaveBeenCalled();
  });

  it("returns focus to the list owner and preserves an unsent draft on close", async () => {
    params.delete("item");
    mount();
    const opener = await screen.findByRole("button", {
      name: `Inspect: ${conditionItem.name}; Location: Not recorded; Unit: pcs; Item reference: ${conditionItem.id}`,
    });
    opener.focus();
    fireEvent.click(opener);
    const detail = await dialog();
    fireEvent.change(detail.getByLabelText("Inspection notes"), { target: { value: "Continue later" } });
    fireEvent.click(detail.getByRole("button", { name: "Close detail" }));
    await waitFor(() => expect(opener).toHaveFocus());
    fireEvent.click(opener);
    expect((await dialog()).getByLabelText("Inspection notes")).toHaveValue("Continue later");
  });

  it("removes write controls immediately when grants are revoked", async () => {
    const view = mount();
    await dialog();
    permissions.delete("assets:reconcile");
    await act(async () => view.rerender(<QueryClientProvider client={clients.at(-1)!}><ConditionStock /></QueryClientProvider>));
    expect(screen.queryByRole("button", { name: "Record resolution" })).toBeNull();
  });
});
