import { afterEach, expect, it, vi } from "vitest";
import { AxiosHeaders } from "axios";
import { api, getEventProposal } from "@/lib/api";
import { PROPOSAL_CLONE_TIMEOUT_MS } from "@/lib/proposal-clone";
import { CLONE_SOURCE_ID, proposalCloneSource } from "./fixtures/proposal-clone";

afterEach(() => vi.restoreAllMocks());

it("passes the clone cancellation signal and bounded timeout through the typed API getter", async () => {
  const controller = new AbortController();
  const data = { proposal: proposalCloneSource(), logs: [] };
  const get = vi.spyOn(api, "get").mockResolvedValue({
    data, status: 200, statusText: "OK", headers: {}, config: { headers: new AxiosHeaders() },
  });
  expect(await getEventProposal(CLONE_SOURCE_ID, { signal: controller.signal, timeout: PROPOSAL_CLONE_TIMEOUT_MS })).toBe(data);
  expect(get).toHaveBeenCalledWith(`/events/proposals/${CLONE_SOURCE_ID}`, { signal: controller.signal, timeout: 30_000 });
  controller.abort();
  expect(controller.signal.aborted).toBe(true);
});

it("retains ordinary detail reads and encodes a source as one path segment", async () => {
  const get = vi.spyOn(api, "get").mockResolvedValue({
    data: { proposal: proposalCloneSource(), logs: [] }, status: 200, statusText: "OK",
    headers: {}, config: { headers: new AxiosHeaders() },
  });
  await getEventProposal("source/with?query");
  expect(get).toHaveBeenCalledWith("/events/proposals/source%2Fwith%3Fquery", undefined);
});
