import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conditionStorageKey, createConditionResolutionStore } from "./condition-resolution-store";
import { createConditionIntent } from "./condition-stock";
import { conditionActor, conditionDraft, conditionIntent, conditionItem, conditionReceipt, otherConditionActor } from "@/__tests__/helpers/condition-stock";

const storage = () => window.sessionStorage;
beforeEach(() => { sessionStorage.clear(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

function ready(actor = conditionActor) {
  const store = createConditionResolutionStore(actor, storage);
  store.load();
  return store;
}

describe("condition-resolution durable ownership", () => {
  it("persists immutable submitted intent before returning a dispatch ticket", () => {
    const store = ready();
    const attempt = store.begin(conditionIntent);
    expect(attempt?.intent).toBe(conditionIntent);
    expect(JSON.parse(sessionStorage.getItem(conditionStorageKey(conditionActor))!)).toMatchObject({
      version: 1, status: "unknown", intent: conditionIntent, receipt: null,
    });
    expect(store.begin(conditionIntent)).toBeNull();
    expect(store.snapshot().phase).toBe("pending");
  });

  it("restores an abandoned pending operation after reload but never dispatches it", () => {
    ready().begin(conditionIntent);
    const restored = ready();
    expect(restored.snapshot()).toMatchObject({ phase: "unknown", intent: conditionIntent, receipt: null });
    expect(restored.begin(createConditionIntent(conditionActor, conditionItem.id, "replacement", conditionDraft))).toBeNull();
    const retry = restored.begin();
    expect(retry).toMatchObject({ intent: conditionIntent, uncertain: true });
  });

  it.each(["getItem", "setItem"] as const)("blocks writes when required storage %s fails", (method) => {
    const store = ready();
    vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("Storage denied"); });
    expect(store.begin(conditionIntent)).toBeNull();
    expect(store.snapshot()).toMatchObject({ phase: "blocked", storageWarning: true });
    expect(console.error).toHaveBeenCalled();
  });

  it("refuses storage that acknowledges a write without retaining it", () => {
    const store = createConditionResolutionStore(conditionActor, () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }));
    store.load();
    expect(store.begin(conditionIntent)).toBeNull();
    expect(store.snapshot().storageWarning).toBe(true);
  });

  it("does not replace an unreadable or foreign journal with an empty success-shaped default", () => {
    for (const raw of ["not JSON", JSON.stringify({ version: 1, intent: { ...conditionIntent, actor_id: otherConditionActor }, status: "unknown", receipt: null })]) {
      sessionStorage.setItem(conditionStorageKey(conditionActor), raw);
      const store = ready();
      expect(store.snapshot().phase).toBe("blocked");
      expect(store.begin(conditionIntent)).toBeNull();
      expect(sessionStorage.getItem(conditionStorageKey(conditionActor))).toBe(raw);
    }
  });

  it("keeps a later known rejection uncertain and retains exactly the same key and payload", () => {
    const store = ready();
    const first = store.begin(conditionIntent)!;
    store.fail(first, "unknown", false);
    const retry = store.begin()!;
    expect(retry.intent).toBe(first.intent);
    store.fail(retry, "access", true);
    expect(store.snapshot()).toMatchObject({ phase: "unknown", failure: "access", intent: conditionIntent });
    expect(store.release("condition-key")).toBe(false);
    expect(ready().snapshot()).toMatchObject({ phase: "unknown", intent: conditionIntent });
  });

  it("does not infer rollback from a missing keyed read while the original may still commit", () => {
    const store = ready();
    store.fail(store.begin(conditionIntent)!, "unknown", false);
    expect(store.inspect("condition-key", null)).toBe(false);
    expect(store.snapshot()).toMatchObject({ phase: "unknown", failure: "noRecord" });
    expect(store.release("condition-key")).toBe(false);
    expect(ready().snapshot().phase).toBe("unknown");
    expect(store.inspect("condition-key", conditionReceipt)).toBe(true);
    expect(store.snapshot().receipt).toEqual(conditionReceipt);
    expect(ready().snapshot().receipt).toEqual(conditionReceipt);
  });

  it("makes mismatched recovery records explicit conflicts, not acknowledgements", () => {
    const store = ready();
    store.fail(store.begin(conditionIntent)!, "unknown", false);
    expect(store.inspect("condition-key", { ...conditionReceipt, notes: "Different intent" })).toBe(false);
    expect(store.snapshot()).toMatchObject({ phase: "conflict", failure: "mismatch", receipt: null });
    expect(store.begin()).toBeNull();
    expect(store.release("condition-key")).toBe(false);
  });

  it("retains authored inputs after an initial known rejection and requires deliberate editing", () => {
    const store = ready();
    store.fail(store.begin(conditionIntent)!, "rejected", true);
    expect(store.snapshot()).toMatchObject({ phase: "rejected", intent: { draft: conditionDraft } });
    expect(ready().snapshot().intent?.draft).toEqual(conditionDraft);
    expect(store.release("another-key")).toBe(false);
    expect(store.release("condition-key")).toBe(true);
    expect(store.snapshot().phase).toBe("idle");
  });

  it("cannot settle or clear a superseded operation with an old ticket", () => {
    const store = ready();
    const first = store.begin(conditionIntent)!;
    expect(store.acknowledge(first, conditionReceipt)).toBe(true);
    expect(store.release("condition-key")).toBe(true);
    const second = createConditionIntent(conditionActor, conditionItem.id, "new-key", { ...conditionDraft, quantity: "3" });
    store.begin(second);
    expect(store.acknowledge(first, conditionReceipt)).toBe(false);
    expect(store.fail(first, "rejected", true)).toBe(false);
    expect(store.release("condition-key")).toBe(false);
    expect(store.snapshot()).toMatchObject({ phase: "pending", intent: second });
  });

  it("keeps user/product ownership through account changes and late acknowledgements", () => {
    const first = ready();
    const ticket = first.begin(conditionIntent)!;
    const other = ready(otherConditionActor);
    const otherIntent = createConditionIntent(otherConditionActor, conditionItem.id, "other-account", conditionDraft);
    other.begin(otherIntent);
    first.acknowledge(ticket, conditionReceipt);
    expect(other.snapshot()).toMatchObject({ phase: "pending", intent: otherIntent, receipt: null });
    expect(JSON.parse(sessionStorage.getItem(conditionStorageKey(otherConditionActor))!).intent).toEqual(otherIntent);
  });

  it("does not erase a newer journal written outside this owner", () => {
    const store = ready();
    const ticket = store.begin(conditionIntent)!;
    const replacement = JSON.stringify({ version: 1, status: "unknown", receipt: null,
      intent: createConditionIntent(conditionActor, conditionItem.id, "other-view", conditionDraft) });
    sessionStorage.setItem(conditionStorageKey(conditionActor), replacement);
    store.acknowledge(ticket, conditionReceipt);
    expect(store.snapshot()).toMatchObject({ phase: "acknowledged", receipt: conditionReceipt, storageWarning: true });
    expect(store.release("condition-key")).toBe(false);
    expect(sessionStorage.getItem(conditionStorageKey(conditionActor))).toBe(replacement);
    store.load(true);
    expect(store.snapshot()).toMatchObject({ phase: "blocked", intent: conditionIntent, storageWarning: true });
    expect(sessionStorage.getItem(conditionStorageKey(conditionActor))).toBe(replacement);
  });

  it("cannot release a remembered uncertain operation by losing and reloading its storage", () => {
    const store = ready();
    store.fail(store.begin(conditionIntent)!, "unknown", false);
    sessionStorage.removeItem(conditionStorageKey(conditionActor));
    store.load(true);
    expect(store.snapshot()).toMatchObject({ phase: "unknown", intent: conditionIntent, storageWarning: false });
    expect(JSON.parse(sessionStorage.getItem(conditionStorageKey(conditionActor))!)).toMatchObject({
      status: "unknown", intent: conditionIntent,
    });
    expect(store.begin(createConditionIntent(conditionActor, conditionItem.id, "new-key", conditionDraft))).toBeNull();
  });

  it("cannot downgrade a newer same-intent attempt from another QueryClient lifetime", () => {
    const first = ready();
    const original = first.begin(conditionIntent)!;
    const replacement = ready();
    const retry = replacement.begin()!;
    const retained = sessionStorage.getItem(conditionStorageKey(conditionActor));
    first.fail(original, "rejected", true);
    expect(sessionStorage.getItem(conditionStorageKey(conditionActor))).toBe(retained);
    expect(ready().snapshot().phase).toBe("unknown");
    expect(first.release("condition-key")).toBe(false);
    replacement.fail(retry, "access", true);
    expect(ready().snapshot()).toMatchObject({ phase: "unknown", intent: conditionIntent });
  });
});
