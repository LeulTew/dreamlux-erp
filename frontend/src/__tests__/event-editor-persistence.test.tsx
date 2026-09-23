import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditEventSheet from "@/components/EditEventSheet";
import type { Event } from "@/lib/types";

const updateEvent = vi.fn();
const createEvent = vi.fn();
const reportError = vi.fn();
vi.mock("@/lib/api", () => ({
  updateEvent: (...args: unknown[]) => updateEvent(...args),
  createEvent: (...args: unknown[]) => createEvent(...args),
  deleteEvent: vi.fn(),
  getEventTypes: vi.fn(async () => []),
  getServiceScopes: vi.fn(async () => []),
}));
vi.mock("@/components/ui/ServiceScopeSelect", () => ({
  ServiceScopeSelect: ({ onChange }: { onChange: (ids: string[]) => void }) => (
    <button type="button" onClick={() => onChange(["29900000-0000-4000-8000-000000000021"])}>Choose setup scope</button>
  ),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en" }) }));
vi.mock("@/lib/toast", () => ({
  notify: { success: vi.fn(), error: (...args: unknown[]) => reportError(...args) },
}));
vi.mock("@/components/ui/ResponsiveDrawer", () => ({
  default: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => <>{children}{footer}</>,
}));
vi.mock("@/components/ActivityDrawer", () => ({ default: () => null }));
vi.mock("@/components/DeleteConfirmModal", () => ({ default: () => null }));

const event: Event = {
  id: "26000000-0000-4000-8000-000000000010",
  name: "Original event", client_name: "Synthetic client", client_phone: "0911000000",
  event_type_id: null, start_date: "2026-10-01", end_date: "2026-10-02",
  start_time: null, end_time: null, venue_location: "Original venue",
  contract_price: 15000, status: "Planned", created_by: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", deleted_at: null,
};
let client: QueryClient;
const onClose = vi.fn();

beforeEach(() => {
  updateEvent.mockReset().mockResolvedValue({ event });
  createEvent.mockReset().mockResolvedValue({ event });
  reportError.mockReset();
  onClose.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cleanup();
  client.clear();
});

function open(record = event) {
  render(<QueryClientProvider client={client}><EditEventSheet event={record} onClose={onClose} /></QueryClientProvider>);
}

it("sends only the user's metadata edit rather than clearing unloaded scopes or resending stale fields", async () => {
  open();
  fireEvent.change(screen.getByPlaceholderText("e.g. Betty's Wedding"), { target: { value: "Updated event" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(updateEvent).toHaveBeenCalledWith(event.id, { name: "Updated event" }));
});

it("sends a service-scope change made in the editor", async () => {
  open({ ...event, service_scope_ids: ["29900000-0000-4000-8000-000000000020"] });
  fireEvent.click(screen.getByRole("button", { name: "Choose setup scope" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(updateEvent).toHaveBeenCalledWith(event.id, {
    service_scope_ids: ["29900000-0000-4000-8000-000000000021"],
  }));
});

it("preserves an explicit zero and nullable clear without resending unrelated state", async () => {
  open({ ...event, service_scope_ids: ["26000000-0000-4000-8000-000000000020"] });
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "0" } });
  expect(screen.getByPlaceholderText("0.00")).toHaveValue(0);
  fireEvent.change(screen.getByPlaceholderText("e.g. 0911223344"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(updateEvent).toHaveBeenCalledWith(event.id, {
    contract_price: 0, client_phone: null,
  }));
});

it("invalidates workspace and calendar consumers after a successful update", async () => {
  const invalidate = vi.spyOn(client, "invalidateQueries");
  open();
  fireEvent.change(screen.getByPlaceholderText("e.g. Betty's Wedding"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["event-workspace", event.id] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["calendar-events"] });
});

it("keeps the draft and shows an unconfirmed-save response instead of closing", async () => {
  updateEvent.mockRejectedValue({ response: { data: { error: "Event update could not be confirmed. Reload before retrying." } } });
  open();
  fireEvent.change(screen.getByPlaceholderText("e.g. Betty's Wedding"), { target: { value: "Keep this edit" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(reportError).toHaveBeenCalledWith("Error", "Event update could not be confirmed. Reload before retrying."));
  expect(screen.getByPlaceholderText("e.g. Betty's Wedding")).toHaveValue("Keep this edit");
  expect(onClose).not.toHaveBeenCalled();
});

it("does not overwrite a redacted financial value with an untouched default", async () => {
  const redacted = { ...event };
  Reflect.deleteProperty(redacted, "contract_price");
  open(redacted);
  fireEvent.change(screen.getByPlaceholderText("e.g. Betty's Wedding"), { target: { value: "Metadata only" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(updateEvent).toHaveBeenCalledWith(event.id, { name: "Metadata only" }));
});

it("retains the full source values when the operator duplicates instead of editing", async () => {
  const scope = "26000000-0000-4000-8000-000000000020";
  open({ ...event, service_scope_ids: [scope] });
  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  fireEvent.click(screen.getByRole("button", { name: "Duplicate Event" }));
  await waitFor(() => expect(createEvent).toHaveBeenCalled());
  expect(createEvent.mock.calls[0][0]).toMatchObject({
    name: "Original event (Copy)", client_name: event.client_name,
    service_scope_ids: [scope], contract_price: 15000,
    start_date: event.start_date, end_date: event.end_date,
  });
  expect(updateEvent).not.toHaveBeenCalled();
});
