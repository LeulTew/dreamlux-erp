import { AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { assertConditionActor, getConditionAuthority, getConditionItem, getConditionStock, submitConditionResolution } from "./condition-stock-api";
import { ConditionAccessChanged, ConditionContractError, ConditionIntentConflict } from "./condition-stock";
import { conditionActor, conditionDetail, conditionIntent, conditionItem, conditionReceipt, otherConditionActor } from "@/__tests__/helpers/condition-stock";

const response = (data: unknown) => ({ data, status: 200, statusText: "OK", headers: {}, config: { headers: new AxiosHeaders() } });
afterEach(() => vi.restoreAllMocks());

describe("condition stock API boundary", () => {
  it("accepts a case-equivalent item UUID without rejecting the canonical database response", async () => {
    const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    const detail = { item: { ...conditionItem, id }, history: [], next_cursor: null, recovery: null };
    const get = vi.spyOn(api, "get").mockResolvedValue(response(detail));
    await expect(getConditionItem(conditionActor, id.toUpperCase())).resolves.toEqual(detail);
    expect(get).toHaveBeenCalledWith(`/events/returns/items/${id}/condition-stock`, expect.any(Object));
  });

  it("uses bounded actor-bound reads and validates rather than fabricating output", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response({ items: [conditionItem], next_cursor: null }));
    expect(await getConditionStock(conditionActor, { search: "plates", includeArchived: true })).toEqual({ items: [conditionItem], next_cursor: null });
    expect(get).toHaveBeenCalledWith("/events/returns/condition-stock", expect.objectContaining({
      timeout: 15_000, headers: { "X-Condition-Actor": conditionActor },
      params: expect.objectContaining({ search: "plates", limit: 25, include_archived: "true" }),
    }));
    get.mockResolvedValue(response({ ...conditionDetail, recovery: conditionReceipt }));
    expect(await getConditionItem(conditionActor, conditionItem.id, { key: conditionReceipt.idempotency_key! }))
      .toEqual({ ...conditionDetail, recovery: conditionReceipt });
    get.mockResolvedValue(response({ items: [] }));
    await expect(getConditionStock(conditionActor)).rejects.toThrow(ConditionContractError);
  });

  it("keeps legacy generic 2xx, missing receipts and intent mismatches unconfirmed", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue(response({ resolved: 2, outcome: "good" }));
    await expect(submitConditionResolution(conditionIntent)).rejects.toThrow(ConditionContractError);
    post.mockResolvedValue(response({ resolved: 2, outcome: "good", resolution: { ...conditionReceipt, created_by: otherConditionActor } }));
    await expect(submitConditionResolution(conditionIntent)).rejects.toThrow(ConditionIntentConflict);
    post.mockResolvedValue(response({ resolved: 2, outcome: "good", resolution: conditionReceipt }));
    expect(await submitConditionResolution(conditionIntent)).toEqual(conditionReceipt);
    expect(post).toHaveBeenLastCalledWith(`/events/returns/items/${conditionItem.id}/condition-resolutions`, conditionIntent.payload, {
      headers: { "X-Condition-Actor": conditionActor }, timeout: 20_000,
    });
  });

  it.each([
    { user_id: conditionActor, permission_slugs: [] },
    { user_id: otherConditionActor, permission_slugs: ["*"] },
    { user_id: conditionActor, role: "ADMIN" },
    { user_id: conditionActor, permission_slugs: ["assets:read"] },
    { user_id: conditionActor, permission_slugs: [42] },
  ])("uses fresh actual permissions and actor identity, never role labels: %j", async (authority) => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response(authority));
    await expect(assertConditionActor(conditionActor)).rejects.toThrow(ConditionAccessChanged);
    expect(get).toHaveBeenCalledWith("/auth/permissions", { timeout: 10_000, signal: undefined });
  });

  it.each(["assets:reconcile", "assets:*", "*"])("admits current %s authority for the same actual actor", async (slug) => {
    vi.spyOn(api, "get").mockResolvedValue(response({ user_id: conditionActor, permission_slugs: [slug] }));
    await expect(assertConditionActor(conditionActor)).resolves.toBeUndefined();
  });

  it.each([null, undefined, "", "legacy-admin"])("rejects unverifiable actor %j without inventing an identity", async (actor) => {
    vi.spyOn(api, "get").mockResolvedValue(response({ user_id: actor, permission_slugs: ["*"], role: "SUPER_ADMIN" }));
    await expect(getConditionAuthority()).rejects.toThrow();
  });

  it("returns verified read-only authority without using the role-derived superuser flag", async () => {
    vi.spyOn(api, "get").mockResolvedValue(response({
      user_id: conditionActor, permission_slugs: ["assets:read"], is_superuser: true, role: "ADMIN",
    }));
    expect(await getConditionAuthority(conditionActor)).toEqual({
      actorId: conditionActor, canRead: true, canResolve: false, canReadMovements: true,
    });
  });
});
