// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import HisabImportPage from "../app/hr/finance/imports/page";
import type { HisabImportCommitPayload, HisabImportPreview } from "@/lib/types";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock useLanguage
let mockLang = "en";
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mockLang,
  }),
}));

// Mock AuthLayout
vi.mock("@/components/AuthLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-layout">{children}</div>,
}));

// Mock toast
vi.mock("@/lib/toast", () => ({
  __esModule: true,
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

type MockAuthData = { permission_slugs?: string[] } | null;
type MockEventsLookup = {
  events: Array<{
    id: string;
    name: string;
    event_id_display?: string;
  }>;
};

// Mock react-query
let mockAuthData: MockAuthData = null;
let mockAuthLoading = false;
const mockEventsLookup: MockEventsLookup = {
  events: [
    { id: "evt-111", name: "Wedding Celebration", event_id_display: "EVT-2026-001" },
    { id: "evt-222", name: "Corporate Launch", event_id_display: "EVT-2026-002" },
  ],
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[] }) => {
    if (options.queryKey[0] === "permissions") {
      return { data: mockAuthData, isLoading: mockAuthLoading };
    }
    if (options.queryKey[0] === "import-events-lookup") {
      return { data: mockEventsLookup, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Mock API calls
const mockPreview = vi.fn();
const mockCommit = vi.fn();
vi.mock("@/lib/api", () => ({
  getEffectivePermissions: vi.fn(),
  getEvents: vi.fn().mockResolvedValue({
    events: [
      { id: "evt-111", name: "Wedding Celebration", event_id_display: "EVT-2026-001" },
      { id: "evt-222", name: "Corporate Launch", event_id_display: "EVT-2026-002" },
    ],
  }),
  previewHisabImport: (file: File) => mockPreview(file),
  commitHisabImport: (payload: HisabImportCommitPayload) => mockCommit(payload),
}));

const PREVIEW_MOCK_DATA: HisabImportPreview = {
  workbookHash: "a50f26f0435696e3b8f9ce0b8b1a2f65b2e79ce78a389d6a93626429353f6294",
  sourceFilename: "hisab-june.xlsx",
  layoutVersion: "legacy-hisab-v1",
  knownSheets: ["HISAB WEEKLY MONTHLY", "INVESTMENT"],
  missingSheets: ["MONTHLY WECHI", "monthly total expense"],
  rows: [
    {
      id: "row-1",
      sheet: "HISAB WEEKLY MONTHLY",
      rowNumber: 10,
      kind: "operational_expense",
      date: "2026-06-01",
      month: "2026-06",
      description: "Office Internet Utilities",
      amount: 1500,
      category: "Utilities",
      requiresResolution: [],
    },
    {
      id: "row-2",
      sheet: "HISAB WEEKLY MONTHLY",
      rowNumber: 11,
      kind: "event_expense",
      date: "2026-06-02",
      month: "2026-06",
      description: "Flowers and Stage Decor",
      amount: 25000,
      category: "Consumables",
      eventName: "Wedding Celebration",
      requiresResolution: [{ kind: "event", value: "Wedding Celebration" }],
    },
  ],
  unmatched: [{ kind: "event", value: "Wedding Celebration" }],
  formulaMismatches: [],
  blockingErrors: [],
  warnings: ["Missing sheet: MONTHLY WECHI"],
  summary: {
    totalRows: 2,
    eventExpenseRows: 1,
    operationalExpenseRows: 1,
    overheadRows: 0,
    investmentRows: 0,
    totalAmount: 26500,
  },
  duplicate: null,
};

describe("Hisab Workbook Import Page Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLang = "en";
    mockAuthData = { permission_slugs: ["finance:imports:write"] };
    mockAuthLoading = false;
  });

  it("gates access to authorized users only", () => {
    mockAuthData = { permission_slugs: [] }; // No permissions
    render(<HisabImportPage />);
    expect(screen.queryByText("Hisab Workbook Import")).not.toBeInTheDocument();
    expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
  });

  it("renders upload drag and drop area initially", () => {
    render(<HisabImportPage />);
    expect(screen.getByText("Hisab Workbook Import")).toBeInTheDocument();
    expect(screen.getByText(/Select Workbook/i)).toBeInTheDocument();
  });

  it("triggers preview parser when file is uploaded", async () => {
    mockPreview.mockResolvedValueOnce(PREVIEW_MOCK_DATA);
    const { container } = render(<HisabImportPage />);

    const file = new File(["dummy workbook"], "hisab-june.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith(file);
    });
  });

  it("renders workbook preview and resolution items", async () => {
    mockPreview.mockResolvedValueOnce(PREVIEW_MOCK_DATA);
    const { container } = render(<HisabImportPage />);

    const file = new File(["dummy workbook"], "hisab-june.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Import Readiness")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Rows")).toBeInTheDocument();
    expect(screen.getByText("Total Amount")).toBeInTheDocument();
    expect(screen.getByText("26,500")).toBeInTheDocument();
    expect(screen.getByText(/Resolve Unmatched Items/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Flowers and Stage Decor/i)[0]).toBeInTheDocument();
  });

  it("blocks committing if formula mismatches exist and accept checkbox is unchecked", async () => {
    const previewWithMismatch = {
      ...PREVIEW_MOCK_DATA,
      formulaMismatches: [
        {
          sheet: "HISAB WEEKLY MONTHLY",
          rowNumber: 100,
          label: "Grand Total",
          expected: 10000,
          actual: 9900,
          delta: -100,
        },
      ],
      unmatched: [],
      rows: [PREVIEW_MOCK_DATA.rows[0]], // only operational, no event resolution needed
    };

    mockPreview.mockResolvedValueOnce(previewWithMismatch);
    const { container } = render(<HisabImportPage />);

    const file = new File(["dummy workbook"], "hisab-june.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Formula Total Mismatches")).toBeInTheDocument();
    });

    const commitBtn = screen.getByRole("button", { name: /Commit Import/i });
    expect(commitBtn).toBeDisabled();

    // Check the box to accept formula mismatches
    const checkbox = screen.getByLabelText(/I have reviewed and accept/i);
    fireEvent.click(checkbox);

    expect(commitBtn).not.toBeDisabled();
  });
});
