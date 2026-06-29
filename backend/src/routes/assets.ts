import { Router, Response } from "express";
import multer from "multer";
import sharp from "sharp";
// @ts-expect-error -- uuid types friction in ESM/CJS
import { v4 as uuidv4 } from "uuid";
import { fromBuffer } from "file-type";
import { supabase } from "../db/supabase";
import { uploadImage, deleteImage, getPublicUrl, downloadImage } from "../storage/storage";
import { AuthRequest, requirePermissions, requireAuth } from "../middleware/auth";
import { NotificationsService } from "../services/notifications-service";
import { ActivityService } from "../services/activity-service";
import {
  createItemSchema,
  updateItemSchema,
  paginationSchema,
  assetsPaginationSchema,
  reconcileItemsSchema,
} from "../lib/validation";
import { ZodError } from "zod";
import { pool } from "../db/pool";
import {
  addLegacyRunsToDeletedFallback,
  addLegacyRunsToTrashFallback,
  getLegacyRunStateSets,
  HistoryView,
  isHistoryClearMarkerNote,
  makeLegacyRunId,
  parseHistoryView,
  parseLegacyRunId,
  removeLegacyRunsFromDeletedFallback,
  removeLegacyRunsFromTrashFallback,
} from "./history-lifecycle";

const router = Router();
router.use(requireAuth);

let auditSchemaEnsured = false;
let ensureAuditSchemaInFlight: Promise<void> | null = null;

/**
 * Hardening: Self-healing schema migration
 * Ensures audit tables and tracking columns exist before operations.
 */
async function ensureAuditTablesExist() {
  if (auditSchemaEnsured) {
    return;
  }

  if (ensureAuditSchemaInFlight) {
    await ensureAuditSchemaInFlight;
    return;
  }

  ensureAuditSchemaInFlight = (async () => {
  try {
    // Check if tables exist
    const { rows } = await pool.query(`
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('inventory_reconciliation_runs', 'inventory_reconciliation_items');
    `);

    if (rows.length < 2) {
      console.log("🛠️ Reconciliation tables missing. Attempting self-healing migration...");
    }

    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      -- 1. Reconciliation Runs (Master)
      CREATE TABLE IF NOT EXISTS inventory_reconciliation_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id UUID,
        initiated_by UUID,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        item_count INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- 2. Reconciliation Items (Detail)
      CREATE TABLE IF NOT EXISTS inventory_reconciliation_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID REFERENCES inventory_reconciliation_runs(id) ON DELETE CASCADE,
        item_id UUID,
        previous_quantity INTEGER NOT NULL DEFAULT 0,
        counted_quantity INTEGER NOT NULL DEFAULT 0,
        delta INTEGER NOT NULL DEFAULT 0,
        counted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        counted_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- 3. Legacy-safe hardening for partial schemas
      ALTER TABLE IF EXISTS inventory_reconciliation_runs
        ADD COLUMN IF NOT EXISTS store_id UUID,
        ADD COLUMN IF NOT EXISTS initiated_by UUID,
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS trashed_by UUID,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

      UPDATE inventory_reconciliation_runs
      SET item_count = COALESCE(item_count, 0)
      WHERE item_count IS NULL;

      ALTER TABLE IF EXISTS inventory_reconciliation_runs
        ALTER COLUMN item_count SET DEFAULT 0,
        ALTER COLUMN item_count SET NOT NULL;

      ALTER TABLE IF EXISTS inventory_reconciliation_items
        ADD COLUMN IF NOT EXISTS run_id UUID,
        ADD COLUMN IF NOT EXISTS item_id UUID,
        ADD COLUMN IF NOT EXISTS previous_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS counted_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS delta INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS counted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS counted_by UUID,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

      UPDATE inventory_reconciliation_items
      SET
        previous_quantity = COALESCE(previous_quantity, 0),
        counted_quantity = COALESCE(counted_quantity, 0),
        delta = COALESCE(delta, COALESCE(counted_quantity, 0) - COALESCE(previous_quantity, 0))
      WHERE
        previous_quantity IS NULL
        OR counted_quantity IS NULL
        OR delta IS NULL;

      ALTER TABLE IF EXISTS inventory_reconciliation_items
        ALTER COLUMN previous_quantity SET DEFAULT 0,
        ALTER COLUMN counted_quantity SET DEFAULT 0,
        ALTER COLUMN delta SET DEFAULT 0,
        ALTER COLUMN previous_quantity SET NOT NULL,
        ALTER COLUMN counted_quantity SET NOT NULL,
        ALTER COLUMN delta SET NOT NULL;
    `);

    // 4. Tracking columns on items
    await pool.query('ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS last_counted_at TIMESTAMP WITH TIME ZONE');
    await pool.query('ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS last_counted_by UUID');
    await pool.query('ALTER TABLE IF EXISTS items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE');

    await pool.query(`
      -- 5. Helpful indexes
      CREATE INDEX IF NOT EXISTS idx_recon_runs_started_at ON inventory_reconciliation_runs (started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_recon_runs_store_started_at ON inventory_reconciliation_runs (store_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_recon_runs_trashed_at ON inventory_reconciliation_runs (trashed_at);
      CREATE INDEX IF NOT EXISTS idx_recon_items_run_id ON inventory_reconciliation_items (run_id);
      CREATE INDEX IF NOT EXISTS idx_recon_items_item_id ON inventory_reconciliation_items (item_id);
      CREATE INDEX IF NOT EXISTS idx_recon_items_counted_at ON inventory_reconciliation_items (counted_at DESC);

      -- 6. Legacy history lifecycle metadata for scale-safe management
      CREATE TABLE IF NOT EXISTS inventory_reconciliation_history_state (
        id INTEGER PRIMARY KEY,
        cleared_before TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inventory_reconciliation_legacy_trash (
        run_id TEXT PRIMARY KEY,
        trashed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        trashed_by UUID
      );

      CREATE TABLE IF NOT EXISTS inventory_reconciliation_legacy_deleted (
        run_id TEXT PRIMARY KEY,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        deleted_by UUID
      );
    `);

    auditSchemaEnsured = true;
    console.log("✅ Audit tables and reconciliation tracking schema are ready.");
  } catch (err) {
    console.error("❌ Failed to verify/create audit tables:", err);
    const maybeCode =
      err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
    const code = typeof maybeCode === "string" ? maybeCode : "";

    // In some environments direct Postgres host resolution is unavailable.
    // Skip further preflight attempts and rely on Supabase API writes below.
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      auditSchemaEnsured = true;
      console.warn("⚠️ Skipping direct audit schema preflight due database DNS resolution error.");
    }
  } finally {
    ensureAuditSchemaInFlight = null;
  }
  })();

  await ensureAuditSchemaInFlight;
}

interface ItemRow {
  id: string;
  name: string;
  quantity: number;
  description: string | null;
  store_id: string;
  image_key: string | null;
  last_counted_at: string | null;
  last_counted_by: { full_name: string } | string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  stores: { name: string } | null;
}

function normalizeQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function isMissingRelationshipError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const maybeCode =
    error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const code = typeof maybeCode === "string" ? maybeCode.toLowerCase() : "";

  return (
    code === "pgrst200" ||
    message.includes("could not find a relationship") ||
    message.includes("schema cache")
  );
}

function isMissingDeletedAtError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const maybeCode =
    error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const code = typeof maybeCode === "string" ? maybeCode.toLowerCase() : "";

  return (
    code === "42703" ||
    message.includes("deleted_at") ||
    message.includes("'deleted_at'")
  );
}

function isMissingLastCountedAtError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const maybeCode =
    error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const code = typeof maybeCode === "string" ? maybeCode.toLowerCase() : "";

  return (
    code === "42703" ||
    message.includes("last_counted_at") ||
    message.includes("'last_counted_at'")
  );
}

function isMissingLastCountedByError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const maybeCode =
    error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const code = typeof maybeCode === "string" ? maybeCode.toLowerCase() : "";

  return (
    code === "42703" ||
    message.includes("last_counted_by") ||
    message.includes("'last_counted_by'")
  );
}

function isMissingTableError(error: unknown, tableName?: string): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const maybeCode =
    error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const code = typeof maybeCode === "string" ? maybeCode.toLowerCase() : "";

  if (
    code !== "42p01" &&
    !message.includes("relation") &&
    !message.includes("does not exist") &&
    !message.includes("could not find the table")
  ) {
    return false;
  }

  if (!tableName) {
    return true;
  }

  return message.includes(tableName.toLowerCase());
}

async function getActiveAllocationQuantities(itemIds: string[]): Promise<Map<string, number>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("event_allocations")
    .select("item_id, quantity_allocated")
    .in("item_id", itemIds)
    .neq("status", "Returned");

  if (error) {
    if (isMissingTableError(error, "event_allocations")) {
      return new Map();
    }
    throw error;
  }

  const allocatedByItem = new Map<string, number>();
  for (const row of (data || []) as Array<{ item_id?: string | null; quantity_allocated?: number | string | null }>) {
    if (!row.item_id) {
      continue;
    }
    allocatedByItem.set(
      row.item_id,
      (allocatedByItem.get(row.item_id) || 0) + normalizeQuantity(row.quantity_allocated)
    );
  }

  return allocatedByItem;
}

function isMissingColumnError(error: unknown, columnName?: string): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const maybeCode =
    error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  const code = typeof maybeCode === "string" ? maybeCode.toLowerCase() : "";

  if (
    code !== "42703" &&
    !message.includes("column") &&
    !message.includes("does not exist") &&
    !message.includes("schema cache")
  ) {
    return false;
  }

  if (!columnName) {
    return true;
  }

  return message.includes(columnName.toLowerCase());
}

async function collectLegacyRunIdsForView(view: HistoryView): Promise<string[]> {
  const runsForView = await fetchLegacyHistoryFromItems({
    store: "all",
    page: 1,
    limit: 10000,
    view,
  });

  const runIds = new Set<string>();
  for (const run of runsForView.runs) {
    if (typeof run.id === "string" && run.id.length > 0) {
      runIds.add(run.id);
    }
  }

  return [...runIds];
}

async function fetchLegacyHistoryFromItems(params: {
  store?: string;
  page: number;
  limit: number;
  startDate?: string;
  endDate?: string;
  view: HistoryView;
}) {
  const { store, page, limit, startDate, endDate, view } = params;
  const offset = (page - 1) * limit;
  const legacyRunState = await getLegacyRunStateSets({ isMissingTableError });

  const selectCandidates = [
    { includeSoftDelete: true, includeCountedBy: true, timeField: "last_counted_at" as const },
    { includeSoftDelete: true, includeCountedBy: false, timeField: "last_counted_at" as const },
    { includeSoftDelete: false, includeCountedBy: true, timeField: "last_counted_at" as const },
    { includeSoftDelete: false, includeCountedBy: false, timeField: "last_counted_at" as const },
    { includeSoftDelete: true, includeCountedBy: false, timeField: "updated_at" as const },
    { includeSoftDelete: false, includeCountedBy: false, timeField: "updated_at" as const },
  ];

  let rows: Array<Record<string, unknown>> = [];
  let resolved = false;

  for (const candidate of selectCandidates) {
    const selectClause = candidate.includeCountedBy
      ? `id, name, quantity, store_id, ${candidate.timeField}, last_counted_by`
      : `id, name, quantity, store_id, ${candidate.timeField}`;

    let query = supabase
      .from("items")
      .select(selectClause, { count: "exact" })
      .not(candidate.timeField, "is", null)
      .order(candidate.timeField, { ascending: false })
      .range(offset, offset + limit - 1);

    if (candidate.includeSoftDelete) {
      query = query.is("deleted_at", null);
    } else {
      query = query.neq("quantity", -999999);
    }

    if (store && store !== "all") {
      query = query.eq("store_id", store);
    }

    if (startDate) {
      query = query.gte(candidate.timeField, startDate);
    }

    if (endDate) {
      const finalEndDate = endDate.length === 10 ? `${endDate}T23:59:59` : endDate;
      query = query.lte(candidate.timeField, finalEndDate);
    }

    const result = await query;
    if (!result.error) {
      rows = (result.data || []) as unknown as Array<Record<string, unknown>>;
      for (const row of rows) {
        row.__legacy_time_field = candidate.timeField;
      }
      resolved = true;
      break;
    }

    if (isMissingColumnError(result.error)) {
      continue;
    }

    throw result.error;
  }

  if (!resolved) {
    return { runs: [], total: 0 };
  }

  const storeIds = [...new Set(rows.map((row) => row.store_id).filter((v): v is string => typeof v === "string"))];
  const userIds = [...new Set(rows.map((row) => row.last_counted_by).filter((v): v is string => typeof v === "string"))];

  const storeNameById = new Map<string, string>();
  const userNameById = new Map<string, string>();

  if (storeIds.length > 0) {
    const { data: storesData } = await supabase.from("stores").select("id, name").in("id", storeIds);
    for (const row of storesData || []) {
      storeNameById.set(row.id, row.name);
    }
  }

  if (userIds.length > 0) {
    const { data: usersData } = await supabase.from("users").select("id, full_name").in("id", userIds);
    for (const row of usersData || []) {
      userNameById.set(row.id, row.full_name);
    }
  }

  const rawRuns = rows.map((row) => {
      const itemId = typeof row.id === "string" ? row.id : "";
      const timeField = row.__legacy_time_field === "updated_at" ? "updated_at" : "last_counted_at";
      const countedAt = typeof row[timeField] === "string" ? String(row[timeField]) : new Date().toISOString();
      const storeId = typeof row.store_id === "string" ? row.store_id : null;
      const countedBy = typeof row.last_counted_by === "string" ? row.last_counted_by : null;
      const source = timeField === "updated_at" ? "updated" : "counted";
      const itemName = typeof row.name === "string" ? row.name : "item";
      const runId = makeLegacyRunId(itemId, countedAt, source);

      return {
        id: runId,
        item_count: 1,
        started_at: countedAt,
        completed_at: countedAt,
        primary_item_name: itemName,
        notes:
          source === "counted"
            ? `Physical Count for ${itemName}`
            : `System Correction for ${itemName}`,
        store: storeId
          ? {
              id: storeId,
              name: storeNameById.get(storeId) || null,
            }
          : null,
        initiated_by: countedBy
          ? {
              id: countedBy,
              full_name: userNameById.get(countedBy) || null,
            }
          : null,
        first_prev: Number(row.quantity ?? 0),
        first_delta: 0,
        total_delta: 0,
        discrepancy_count: 0,
      };
    });

  const filteredRuns = rawRuns.filter((run) => {
    if (legacyRunState.deleted.has(run.id)) {
      return false;
    }

    const isTrashed = legacyRunState.trashed.has(run.id);
    return view === "trash" ? isTrashed : !isTrashed;
  });

  return {
    runs: filteredRuns,
    total: filteredRuns.length,
  };
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are allowed"));
    }
  },
});

// POST /items — create item with image
router.post(
  "/",
  requirePermissions("assets", "write"),
  upload.single("image"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    let imageKey: string | null = null;

    try {
      // Validate body with zod
      const parsed = createItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const { name, quantity, store_id, description } = parsed.data;
      const file = req.file;
      const cloneFromId = req.body.clone_from_id as string | undefined;

      if (!file && !cloneFromId) {
        res.status(400).json({ error: "Image is required" });
        return;
      }

      // Generate item ID
      const itemId = uuidv4();
      imageKey = `${store_id}/${itemId}.webp`;

      if (file) {
        // Magic-byte file verification
        const detectedType = await fromBuffer(file.buffer);
        if (!detectedType || !["image/jpeg", "image/png"].includes(detectedType.mime)) {
          res.status(400).json({
            error: "File content does not match JPEG/PNG format",
          });
          return;
        }

        // Compress image server-side: auto-rotate EXIF + convert to WebP
        const compressedBuffer = await sharp(file.buffer)
          .rotate()
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        // Upload to storage FIRST
        await uploadImage(imageKey, compressedBuffer, "image/webp");
      } else if (cloneFromId) {
        // Fetch source item to copy the image
        const { data: sourceItem, error: sourceError } = await supabase
          .from("items")
          .select("image_key")
          .eq("id", cloneFromId)
          .single();

        if (sourceError || !sourceItem?.image_key) {
          res.status(400).json({ error: "Source asset image not found for cloning" });
          return;
        }

        const buffer = await downloadImage(sourceItem.image_key);
        await uploadImage(imageKey, buffer, "image/webp");
      }

      // Get default category
      const { data: catData } = await supabase.from("categories").select("id").limit(1);
      const categoryId = catData?.[0]?.id ?? null;

      // Insert item — if this fails, we clean up the orphaned image
      const { data: itemData, error } = await supabase
        .from("items")
        .insert({
          id: itemId,
          name,
          quantity,
          description: description ?? null,
          store_id,
          category_id: categoryId,
          image_key: imageKey,
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        ...itemData,
        image_url: getPublicUrl(itemData.image_key),
      });
    } catch (error: unknown) {
      if (imageKey) {
        try {
          await deleteImage(imageKey);
        } catch (storageError) {
          console.error(`Failed to cleanup storage for key ${imageKey}:`, storageError);
        }
      }
      console.error("Failed to create item:", error);
      res.status(500).json({
        error: "Failed to create item",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// GET /items — list items with optional store filter
// Get inventory aggregate stats
router.get("/stats", requirePermissions("assets", "read"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureAuditTablesExist();
    const { data: storesData, error: storesError } = await supabase
      .from("stores")
      .select("id, name")
      .order("name", { ascending: true });

    if (storesError) throw storesError;

    const queryCandidates: Array<{ includeLastCountedAt: boolean; includeSoftDelete: boolean }> = [
      { includeLastCountedAt: true, includeSoftDelete: true },
      { includeLastCountedAt: true, includeSoftDelete: false },
      { includeLastCountedAt: false, includeSoftDelete: true },
      { includeLastCountedAt: false, includeSoftDelete: false },
    ];

    let items: Array<{ quantity: number | null; store_id: string; last_counted_at: string | null }> = [];
    let resolved = false;
    let lastError: unknown = null;

    for (const candidate of queryCandidates) {
      const selectClause = candidate.includeLastCountedAt
        ? "quantity, store_id, last_counted_at"
        : "quantity, store_id";

      let query = supabase.from("items").select(selectClause);
      if (candidate.includeSoftDelete) {
        query = query.is("deleted_at", null);
      } else {
        // Legacy schemas used -999999 as a soft-delete sentinel quantity.
        query = query.neq("quantity", -999999);
      }

      const { data, error } = await query;
      if (!error) {
        const rows = (data || []) as unknown as Array<{
          quantity: number | null;
          store_id: string;
          last_counted_at?: string | null;
        }>;
        items = rows.map((row) => ({
          quantity: row.quantity ?? 0,
          store_id: row.store_id,
          last_counted_at: row.last_counted_at ?? null,
        }));
        resolved = true;
        break;
      }

      lastError = error;
      const schemaDriftError =
        (candidate.includeSoftDelete && isMissingDeletedAtError(error)) ||
        (candidate.includeLastCountedAt && isMissingLastCountedAtError(error));

      if (!schemaDriftError) {
        throw error;
      }
    }

    if (!resolved) {
      throw lastError || new Error("Unable to query items for stats");
    }

    const stores = storesData || [];

    const totalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const lowStockItems = items.filter((item) => Number(item.quantity || 0) < 5).length;

    // Monthly Reconciliation Progress (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const reconciledRecently = items.filter((item) => 
      item.last_counted_at && new Date(item.last_counted_at) > thirtyDaysAgo
    ).length;

    const totalsByStore = new Map<string, number>();
    const lowStockByStore = new Map<string, number>();
    const entriesByStore = new Map<string, number>();
    for (const item of items) {
      const current = totalsByStore.get(item.store_id) || 0;
      totalsByStore.set(item.store_id, current + Number(item.quantity || 0));

      const entryCount = entriesByStore.get(item.store_id) || 0;
      entriesByStore.set(item.store_id, entryCount + 1);

      if (Number(item.quantity || 0) < 5) {
        const lowStockCount = lowStockByStore.get(item.store_id) || 0;
        lowStockByStore.set(item.store_id, lowStockCount + 1);
      }
    }

    const stockPerLocation = stores.map((store: any) => ({
      location: store.name,
      quantity: totalsByStore.get(store.id) || 0,
      lowStockItems: lowStockByStore.get(store.id) || 0,
      totalEntries: entriesByStore.get(store.id) || 0,
    }));

    res.json({
      totalItems,
      stockPerLocation,
      lowStockItems,
      reconciledRecently,
      totalEntries: items.length,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch stats:", error);
    res.status(500).json({ 
      error: "Internal server error while fetching stats",
      details: extractErrorMessage(error)
    });
  }
});

router.get(
  "/reconcile/preview",
  requirePermissions("assets", "read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pagination = paginationSchema.parse(req.query);
    const { store, page, limit } = pagination;
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    const runPreviewQuery = async (supportsSoftDelete: boolean, includeExtendedFields: boolean) => {
      const selectClause = includeExtendedFields
        ? "id, name, quantity, store_id, created_at, updated_at, last_counted_at, last_counted_by, stores(name)"
        : "id, name, quantity, store_id, created_at, updated_at";

      let query = supabase
        .from("items")
        .select(selectClause, {
          count: "exact",
        });

      if (supportsSoftDelete) {
        query = query.is("deleted_at", null);
      } else {
        query = query.neq("quantity", -999999);
      }

      if (store && store !== "all") {
        query = query.eq("store_id", store);
      }

      if (req.query.filter === "low-stock") {
        query = query.lt("quantity", 5);
      }

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }

      return query
        .order("name", { ascending: true })
        .range(offset, offset + limit - 1);
    };

    const primary = await runPreviewQuery(true, true);

    let rows = (primary.data || []) as any[];
    let count = primary.count || 0;
    let error = primary.error;

    const isRecoverablePreviewError = (previewError: unknown) =>
      isMissingDeletedAtError(previewError) ||
      isMissingLastCountedAtError(previewError) ||
      isMissingLastCountedByError(previewError) ||
      isMissingRelationshipError(previewError);

    if (error && isRecoverablePreviewError(error)) {
      const fallbackPlans: Array<{ supportsSoftDelete: boolean; includeExtendedFields: boolean }> = [
        { supportsSoftDelete: true, includeExtendedFields: false },
        { supportsSoftDelete: false, includeExtendedFields: false },
      ];

      for (const plan of fallbackPlans) {
        const fallback = await runPreviewQuery(plan.supportsSoftDelete, plan.includeExtendedFields);
        rows = (fallback.data || []) as any[];
        count = fallback.count || 0;
        error = fallback.error;

        if (!error) {
          break;
        }

        if (!isMissingDeletedAtError(error)) {
          break;
        }
      }
    }

    if (error) throw error;

    const userIds = [...new Set(rows.map((row) => row.last_counted_by).filter(Boolean))] as string[];
    const userNameById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", userIds);

      if (!usersError) {
        for (const row of usersData || []) {
          userNameById.set(row.id, row.full_name);
        }
      }
    }

    const items = rows.map((row) => {
      const storesValue = row.stores as unknown;
      let storeName: string | null = null;

      if (Array.isArray(storesValue)) {
        const first = storesValue[0] as { name?: unknown } | undefined;
        storeName = typeof first?.name === "string" ? first.name : null;
      } else if (storesValue && typeof storesValue === "object") {
        const maybeName = (storesValue as { name?: unknown }).name;
        storeName = typeof maybeName === "string" ? maybeName : null;
      }

      return {
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      store: {
        id: row.store_id,
        name: storeName,
      },
      last_counted_at: row.last_counted_at || null,
      last_counted_by: row.last_counted_by
        ? {
            id: row.last_counted_by,
            full_name: userNameById.get(row.last_counted_by) || null,
          }
        : null,
      };
    });

    res.json({ items, total: count, page, limit });
  } catch (error: unknown) {
    console.error("Failed to fetch reconciliation preview:", error);
    res.status(500).json({
      error: "Failed to fetch reconciliation preview",
      details: extractErrorMessage(error),
    });
  }
});

router.get("/", requirePermissions("assets", "read"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pagination = assetsPaginationSchema.parse(req.query);
    const filter = req.query.filter as string | undefined;
    const search = req.query.search as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const { store, page, limit, sortBy, sortOrder } = pagination;
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const trashFlag = req.query.trash;
    const includeTrash =
      status === "trash" ||
      trashFlag === "true" ||
      trashFlag === "1";

    const applyCommonFilters = (query: any, supportsSoftDelete = true) => {
      let filteredQuery = query;

      if (supportsSoftDelete) {
        if (includeTrash) {
          filteredQuery = filteredQuery.not("deleted_at", "is", null);
        } else {
          filteredQuery = filteredQuery.is("deleted_at", null);
        }
      } else {
        // Legacy schemas used -999999 as a soft-delete sentinel quantity.
        if (includeTrash) {
          filteredQuery = filteredQuery.eq("quantity", -999999);
        } else {
          filteredQuery = filteredQuery.neq("quantity", -999999);
        }
      }

      if (store && store !== "all") {
        filteredQuery = filteredQuery.eq("store_id", store);
      }

      if (filter === "low-stock") {
        filteredQuery = filteredQuery.lt("quantity", 5);
      }

      if (search && search.trim().length > 0) {
        filteredQuery = filteredQuery.ilike("name", `%${search.trim()}%`);
      }

      const rangeField = supportsSoftDelete
        ? includeTrash
          ? "deleted_at"
          : "created_at"
        : includeTrash
          ? "updated_at"
          : "created_at";

      if (from && from.trim().length > 0) {
        filteredQuery = filteredQuery.gte(rangeField, from.trim());
      }

      if (to && to.trim().length > 0) {
        filteredQuery = filteredQuery.lte(rangeField, to.trim());
      }

      return filteredQuery
        .order(sortBy, { ascending: sortOrder === "asc" })
        .range(offset, offset + limit - 1);
    };

    const primaryQuery = applyCommonFilters(
      supabase
      .from("items")
        .select("*, stores(name), last_counted_by:users(full_name)", { count: "exact" })
    );

    const { data: primaryData, error: primaryError, count: primaryCount } = await primaryQuery;

    let resultData = primaryData;
    let count = primaryCount;

    if (primaryError) {
      if (isMissingDeletedAtError(primaryError)) {
        const legacyQuery = applyCommonFilters(
          supabase.from("items").select("*, stores(name)", { count: "exact" }),
          false
        );
        const { data: legacyData, error: legacyError, count: legacyCount } = await legacyQuery;
        if (legacyError) {
          throw legacyError;
        }
        resultData = legacyData;
        count = legacyCount;
      } else if (isMissingRelationshipError(primaryError)) {
        const fallbackQuery = applyCommonFilters(
          supabase.from("items").select("*, stores(name)", { count: "exact" })
        );
        const { data: fallbackData, error: fallbackError, count: fallbackCount } = await fallbackQuery;
        if (fallbackError) {
          if (isMissingDeletedAtError(fallbackError)) {
            const legacyQuery = applyCommonFilters(
              supabase.from("items").select("*, stores(name)", { count: "exact" }),
              false
            );
            const { data: legacyData, error: legacyError, count: legacyCount } = await legacyQuery;
            if (legacyError) {
              throw legacyError;
            }
            resultData = legacyData;
            count = legacyCount;
          } else {
            throw fallbackError;
          }
        } else {
          resultData = fallbackData;
          count = fallbackCount;
        }
      } else {
        throw primaryError;
      }
    }

    const rows = (resultData || []) as unknown as ItemRow[];
    const itemIds = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
    const allocatedByItem = await getActiveAllocationQuantities(itemIds);

    // Resolve image URLs
    const items = rows.map((row) => {
      const quantity = normalizeQuantity(row.quantity);
      const allocatedQuantity = allocatedByItem.get(row.id) || 0;

      return {
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        allocated_quantity: allocatedQuantity,
        available_quantity: Math.max(0, quantity - allocatedQuantity),
        description: row.description,
        store: {
          id: row.store_id,
          name: row.stores?.name,
        },
        image_url: row.image_key ? getPublicUrl(row.image_key) : null,
        last_counted_at: row.last_counted_at ?? null,
        last_counted_by:
          row.last_counted_by && typeof row.last_counted_by === "object"
            ? { full_name: row.last_counted_by.full_name }
            : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    res.json({ items, total: count || 0, page, limit });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Invalid asset query parameters",
        details: error.issues.map((issue) => issue.message),
      });
      return;
    }
    console.error("Failed to fetch items:", error);
    res.status(500).json({
      error: "Failed to fetch items",
      details: extractErrorMessage(error),
    });
  }
});

router.get("/history", requirePermissions("assets", "read"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureAuditTablesExist();
    const pagination = paginationSchema.parse(req.query);
    const { store, page, limit } = pagination;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const includeLegacy = String(req.query.includeLegacy || "").toLowerCase() === "1" || String(req.query.includeLegacy || "").toLowerCase() === "true";
    const view = parseHistoryView(req.query.view);
    const offset = (page - 1) * limit;

    const runSelectCandidates = [
      "id, store_id, initiated_by, started_at, completed_at, item_count, notes, trashed_at",
      "id, store_id, initiated_by, started_at, completed_at, item_count, notes",
      "id, store_id, initiated_by, started_at, completed_at, item_count",
      "id, store_id, initiated_by, started_at, completed_at",
      "id, store_id, initiated_by, started_at",
    ];

    let data: Array<Record<string, unknown>> = [];
    let error: unknown = null;
    let count: number | null = 0;

    for (const selectClause of runSelectCandidates) {
      let query = supabase
        .from("inventory_reconciliation_runs")
        .select(selectClause, { count: "exact" })
        .order("started_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (store && store !== "all") {
        query = query.eq("store_id", store);
      }

      if (view === "trash") {
        query = query.not("trashed_at", "is", null);
      } else {
        query = query.is("trashed_at", null);
      }

      if (startDate) {
        query = query.gte("started_at", startDate);
      }

      if (endDate) {
        // If only date is provided (YYYY-MM-DD), append time to include the full day
        const finalEndDate = endDate.length === 10 ? `${endDate}T23:59:59` : endDate;
        query = query.lte("started_at", finalEndDate);
      }

      const result = await query;
      if (!result.error) {
        data = (result.data || []) as unknown as Array<Record<string, unknown>>;
        count = result.count;
        error = null;
        break;
      }

      if (isMissingTableError(result.error, "inventory_reconciliation_runs")) {
        error = result.error;
        break;
      }

      if (isMissingColumnError(result.error)) {
        error = result.error;
        continue;
      }

      error = result.error;
      break;
    }

    if (error) {
      if (isMissingTableError(error, "inventory_reconciliation_runs")) {
        if (includeLegacy) {
          const legacy = await fetchLegacyHistoryFromItems({ store, page, limit, startDate, endDate, view });
          res.json({ runs: legacy.runs, total: legacy.total, page, limit });
          return;
        }
        res.json({ runs: [], total: 0, page, limit });
        return;
      }
      throw error;
    }

    const runs = data.map((run) => {
      const storeId = typeof run.store_id === "string" ? run.store_id : null;
      const initiatedBy = typeof run.initiated_by === "string" ? run.initiated_by : null;
      return {
        id: String(run.id || ""),
        store_id: storeId,
        initiated_by: initiatedBy,
        started_at: String(run.started_at || ""),
        completed_at: typeof run.completed_at === "string" ? run.completed_at : null,
        item_count: Number(run.item_count ?? 0),
        notes: typeof run.notes === "string" ? run.notes : null,
        trashed_at: typeof run.trashed_at === "string" ? run.trashed_at : null,
      };
    }).filter((run) => !isHistoryClearMarkerNote(run.notes));

    if (includeLegacy && runs.length === 0 && Number(count || 0) === 0) {
      const legacy = await fetchLegacyHistoryFromItems({ store, page, limit, startDate, endDate, view });
      res.json({ runs: legacy.runs, total: legacy.total, page, limit });
      return;
    }

    const storeIds = [...new Set(runs.map((run) => run.store_id).filter(Boolean))] as string[];
    const userIds = [...new Set(runs.map((run) => run.initiated_by).filter(Boolean))] as string[];

    const storeNameById = new Map<string, string>();
    const userNameById = new Map<string, string>();
    const primaryItemNameByRunId = new Map<string, string>();

    if (storeIds.length > 0) {
      const { data: storesData } = await supabase.from("stores").select("id, name").in("id", storeIds);
      for (const row of storesData || []) {
        storeNameById.set(row.id, row.name);
      }
    }

    if (userIds.length > 0) {
      const { data: usersData } = await supabase.from("users").select("id, full_name").in("id", userIds);
      for (const row of usersData || []) {
        userNameById.set(row.id, row.full_name);
      }
    }

    const runIds = runs.map((run) => run.id).filter(Boolean);
    const runStatsByRunId = new Map<string, { total_delta: number; discrepancy_count: number; first_prev?: number; first_delta?: number }>();

    if (runIds.length > 0) {
      const [runItemRows, auditStatsResult] = await Promise.all([
        supabase
          .from("inventory_reconciliation_items")
          .select("run_id, item_id, counted_at")
          .in("run_id", runIds)
          .order("counted_at", { ascending: false }),
        supabase
          .from("inventory_reconciliation_items")
          .select("run_id, delta, previous_quantity, counted_at")
          .in("run_id", runIds)
          .order("counted_at", { ascending: true })
      ]);

      if (!runItemRows.error || isMissingTableError(runItemRows.error, "inventory_reconciliation_items")) {
        const firstItemIdByRunId = new Map<string, string>();
        for (const row of runItemRows.data || []) {
          if (typeof row.run_id === "string" && typeof row.item_id === "string" && !firstItemIdByRunId.has(row.run_id)) {
            firstItemIdByRunId.set(row.run_id, row.item_id);
          }
        }

        const uniqueItemIds = [...new Set(Array.from(firstItemIdByRunId.values()))];
        if (uniqueItemIds.length > 0) {
          const { data: itemsData } = await supabase.from("items").select("id, name").in("id", uniqueItemIds);
          const itemNameById = new Map<string, string>();
          for (const row of itemsData || []) {
            itemNameById.set(row.id, row.name);
          }

          for (const [runId, itemId] of firstItemIdByRunId.entries()) {
            const itemName = itemNameById.get(itemId);
            if (itemName) {
              primaryItemNameByRunId.set(runId, itemName);
            }
          }
        }
      }

      if (!auditStatsResult.error || isMissingTableError(auditStatsResult.error, "inventory_reconciliation_items")) {
        for (const row of auditStatsResult.data || []) {
          const stats = runStatsByRunId.get(row.run_id) || { total_delta: 0, discrepancy_count: 0 };
          const rowDelta = Number(row.delta || 0);
          stats.total_delta += rowDelta;
          if (rowDelta !== 0) stats.discrepancy_count += 1;
          
          // Prefer a non-zero representative change for single-item cards.
          const isBetterRepresentative = 
            stats.first_prev === undefined || 
            ((stats.first_delta ?? 0) === 0 && rowDelta !== 0);

          if (isBetterRepresentative) {
            stats.first_prev = Number(row.previous_quantity || 0);
            stats.first_delta = rowDelta;
          }
          runStatsByRunId.set(row.run_id, stats);
        }
      }
    }

    // Secondary pass for single-item runs where delta is 0, to ensure we pick the correct previous_quantity (if available)
    // although the loop above with order("counted_at", { ascending: false }) should have picked the latest.

    res.json({
      runs: runs.map((run) => {
        const stats = runStatsByRunId.get(run.id);
        return {
          id: run.id,
          item_count: Number(run.item_count ?? 0),
          started_at: run.started_at,
          completed_at: run.completed_at ?? null,
          notes: run.notes || null,
          primary_item_name: primaryItemNameByRunId.get(run.id) || null,
          total_delta: stats?.total_delta ?? 0,
          discrepancy_count: stats?.discrepancy_count ?? 0,
          first_prev: stats?.first_prev,
          first_delta: stats?.first_delta,
          store: run.store_id
            ? {
                id: run.store_id,
                name: storeNameById.get(run.store_id) || null,
              }
            : null,
          initiated_by: run.initiated_by
            ? {
                id: run.initiated_by,
                full_name: userNameById.get(run.initiated_by) || null,
              }
            : null,
        };
      }),
      total: count || 0,
      page,
      limit,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch reconciliation history:", error);
    res.status(500).json({
      error: "Failed to fetch reconciliation history",
      details: extractErrorMessage(error),
    });
  }
});

router.patch(
  "/history/:runId/trash",
  requirePermissions("assets", "delete"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { runId } = req.params;
      const trashed = Boolean(req.body?.trashed);
      const userId = req.user?.id || null;
      const nowIso = new Date().toISOString();

      const legacyRun = parseLegacyRunId(runId);
      if (legacyRun) {
        if (trashed) {
          const [trashUpsert, unDelete] = await Promise.all([
            supabase.from("inventory_reconciliation_legacy_trash").upsert({ run_id: runId, trashed_at: nowIso, trashed_by: userId }),
            supabase.from("inventory_reconciliation_legacy_deleted").delete().eq("run_id", runId),
          ]);

          if (trashUpsert.error && !isMissingTableError(trashUpsert.error, "inventory_reconciliation_legacy_trash")) {
            throw trashUpsert.error;
          }

          if (unDelete.error && !isMissingTableError(unDelete.error, "inventory_reconciliation_legacy_deleted")) {
            throw unDelete.error;
          }

          await Promise.all([
            addLegacyRunsToTrashFallback([runId], { isMissingTableError }),
            removeLegacyRunsFromDeletedFallback([runId], { isMissingTableError }),
          ]);
        } else {
          const restore = await supabase.from("inventory_reconciliation_legacy_trash").delete().eq("run_id", runId);
          if (restore.error && !isMissingTableError(restore.error, "inventory_reconciliation_legacy_trash")) {
            throw restore.error;
          }

          await removeLegacyRunsFromTrashFallback([runId], { isMissingTableError });
        }

        res.json({ success: true, run_id: runId, trashed });
        return;
      }

      const updatePayload = trashed
        ? { trashed_at: nowIso, trashed_by: userId }
        : { trashed_at: null, trashed_by: null };

      const updateResult = await supabase
        .from("inventory_reconciliation_runs")
        .update(updatePayload)
        .eq("id", runId)
        .select("id")
        .maybeSingle();

      if (updateResult.error) {
        if (isMissingTableError(updateResult.error, "inventory_reconciliation_runs")) {
          res.status(404).json({ error: "Reconciliation history is not enabled" });
          return;
        }
        throw updateResult.error;
      }

      if (!updateResult.data?.id) {
        res.status(404).json({ error: "Reconciliation run not found" });
        return;
      }

      res.json({ success: true, run_id: runId, trashed });
    } catch (error: unknown) {
      console.error("Failed to update reconciliation run trash state:", error);
      res.status(500).json({
        error: "Failed to update reconciliation run trash state",
        details: extractErrorMessage(error),
      });
    }
  }
);

router.delete(
  "/history/:runId",
  requirePermissions("assets", "delete"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { runId } = req.params;
      const userId = req.user?.id || null;
      const nowIso = new Date().toISOString();
      const legacyRun = parseLegacyRunId(runId);

      if (legacyRun) {
        const [softDelete, unTrash] = await Promise.all([
          supabase.from("inventory_reconciliation_legacy_deleted").upsert({ run_id: runId, deleted_at: nowIso, deleted_by: userId }),
          supabase.from("inventory_reconciliation_legacy_trash").delete().eq("run_id", runId),
        ]);

        if (softDelete.error && !isMissingTableError(softDelete.error, "inventory_reconciliation_legacy_deleted")) {
          throw softDelete.error;
        }

        if (unTrash.error && !isMissingTableError(unTrash.error, "inventory_reconciliation_legacy_trash")) {
          throw unTrash.error;
        }

        await Promise.all([
          addLegacyRunsToDeletedFallback([runId], { isMissingTableError }),
          removeLegacyRunsFromTrashFallback([runId], { isMissingTableError }),
        ]);

        res.json({ success: true, run_id: runId, deleted: true });
        return;
      }

      const runDelete = await supabase
        .from("inventory_reconciliation_runs")
        .delete()
        .eq("id", runId)
        .select("id")
        .maybeSingle();

      if (runDelete.error) {
        if (isMissingTableError(runDelete.error, "inventory_reconciliation_runs")) {
          res.status(404).json({ error: "Reconciliation history is not enabled" });
          return;
        }
        throw runDelete.error;
      }

      if (!runDelete.data?.id) {
        res.status(404).json({ error: "Reconciliation run not found" });
        return;
      }

      res.json({ success: true, run_id: runId, deleted: true });
    } catch (error: unknown) {
      console.error("Failed to permanently delete reconciliation history run:", error);
      res.status(500).json({
        error: "Failed to permanently delete reconciliation history run",
        details: extractErrorMessage(error),
      });
    }
  }
);

router.post(
  "/history/trash-all",
  requirePermissions("assets", "delete"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await ensureAuditTablesExist();
      const nowIso = new Date().toISOString();
      const userId = req.user?.id || null;

      let movedRunsCount = 0;
      const moveRunsResult = await supabase
        .from("inventory_reconciliation_runs")
        .update({ trashed_at: nowIso, trashed_by: userId })
        .is("trashed_at", null)
        .select("id");

      if (moveRunsResult.error && !isMissingTableError(moveRunsResult.error, "inventory_reconciliation_runs")) {
        throw moveRunsResult.error;
      }

      if (!moveRunsResult.error) {
        movedRunsCount = (moveRunsResult.data || []).length;
      }

      const legacyActiveRunIds = await collectLegacyRunIdsForView("active");
      let movedLegacyCount = 0;

      if (legacyActiveRunIds.length > 0) {
        const [moveLegacyResult, restoreLegacyResult] = await Promise.all([
          supabase
            .from("inventory_reconciliation_legacy_trash")
            .upsert(
              legacyActiveRunIds.map((runId) => ({
                run_id: runId,
                trashed_at: nowIso,
                trashed_by: userId,
              }))
            ),
          supabase
            .from("inventory_reconciliation_legacy_deleted")
            .delete()
            .in("run_id", legacyActiveRunIds),
        ]);

        if (moveLegacyResult.error && !isMissingTableError(moveLegacyResult.error, "inventory_reconciliation_legacy_trash")) {
          throw moveLegacyResult.error;
        }

        if (restoreLegacyResult.error && !isMissingTableError(restoreLegacyResult.error, "inventory_reconciliation_legacy_deleted")) {
          throw restoreLegacyResult.error;
        }

        if (!moveLegacyResult.error) {
          movedLegacyCount = legacyActiveRunIds.length;
        }

        await Promise.all([
          addLegacyRunsToTrashFallback(legacyActiveRunIds, { isMissingTableError }),
          removeLegacyRunsFromDeletedFallback(legacyActiveRunIds, { isMissingTableError }),
        ]);
      }

      res.json({
        success: true,
        moved_runs: movedRunsCount,
        moved_legacy_runs: movedLegacyCount,
      });
    } catch (error: unknown) {
      console.error("Failed to move reconciliation history to trash:", error);
      res.status(500).json({
        error: "Failed to move reconciliation history to trash",
        details: extractErrorMessage(error),
      });
    }
  }
);

router.post(
  "/history/clear",
  requirePermissions("assets", "delete"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      await ensureAuditTablesExist();
      const nowIso = new Date().toISOString();
      const userId = req.user?.id || null;

      const trashedRunIdsResult = await supabase
        .from("inventory_reconciliation_runs")
        .select("id")
        .not("trashed_at", "is", null);

      if (trashedRunIdsResult.error && !isMissingTableError(trashedRunIdsResult.error, "inventory_reconciliation_runs")) {
        throw trashedRunIdsResult.error;
      }

      const trashedRunIds = (trashedRunIdsResult.data || [])
        .map((row: any) => (typeof row.id === "string" ? row.id : null))
        .filter((id: any): id is string => Boolean(id));

      if (trashedRunIds.length > 0) {
        const deleteRunsResult = await supabase
          .from("inventory_reconciliation_runs")
          .delete()
          .in("id", trashedRunIds);

        if (deleteRunsResult.error && !isMissingTableError(deleteRunsResult.error, "inventory_reconciliation_runs")) {
          throw deleteRunsResult.error;
        }
      }

      const legacyState = await getLegacyRunStateSets({ isMissingTableError });
      const legacyTrashRunIds = [...legacyState.trashed];

      if (legacyTrashRunIds.length > 0) {
        const { error: markLegacyDeletedError } = await supabase
          .from("inventory_reconciliation_legacy_deleted")
          .upsert(
            legacyTrashRunIds.map((runId) => ({
              run_id: runId,
              deleted_at: nowIso,
              deleted_by: userId,
            }))
          );

        if (markLegacyDeletedError && !isMissingTableError(markLegacyDeletedError, "inventory_reconciliation_legacy_deleted")) {
          throw markLegacyDeletedError;
        }

        const clearTrash = await supabase
          .from("inventory_reconciliation_legacy_trash")
          .delete()
          .in("run_id", legacyTrashRunIds);

        if (clearTrash.error && !isMissingTableError(clearTrash.error, "inventory_reconciliation_legacy_trash")) {
          throw clearTrash.error;
        }

        await Promise.all([
          addLegacyRunsToDeletedFallback(legacyTrashRunIds, { isMissingTableError }),
          removeLegacyRunsFromTrashFallback(legacyTrashRunIds, { isMissingTableError }),
        ]);
      }

      res.json({
        success: true,
        deleted_runs: trashedRunIds.length,
        deleted_legacy_runs: legacyTrashRunIds.length,
      });
    } catch (error: unknown) {
      console.error("Failed to clear reconciliation history:", error);
      res.status(500).json({
        error: "Failed to clear reconciliation history",
        details: extractErrorMessage(error),
      });
    }
  }
);

router.get(
  "/history/:runId",
  requirePermissions("assets", "read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { runId } = req.params;
    const legacyRun = parseLegacyRunId(runId);

    if (legacyRun) {
      const selectCandidates = [
        "id, name, quantity, store_id, last_counted_at, last_counted_by",
        "id, name, quantity, store_id, last_counted_at",
        "id, name, quantity, store_id, updated_at",
      ];

      let legacyRow: Record<string, unknown> | null = null;

      for (const selectClause of selectCandidates) {
        const attempt = await supabase
          .from("items")
          .select(selectClause)
          .eq("id", legacyRun.itemId)
          .single();

        if (!attempt.error && attempt.data) {
          legacyRow = attempt.data as unknown as Record<string, unknown>;
          break;
        }

        if (attempt.error && isMissingColumnError(attempt.error)) {
          continue;
        }

        break;
      }

      const countedAt =
        legacyRun.source === "updated"
          ? (typeof legacyRow?.updated_at === "string" ? legacyRow.updated_at : null)
          : (typeof legacyRow?.last_counted_at === "string" ? legacyRow.last_counted_at : null);
      if (!legacyRow || !countedAt) {
        res.status(404).json({ error: "Reconciliation run not found" });
        return;
      }

      const storeId = typeof legacyRow.store_id === "string" ? legacyRow.store_id : null;
      const countedBy = typeof legacyRow.last_counted_by === "string" ? legacyRow.last_counted_by : null;
      const itemName = typeof legacyRow.name === "string" ? legacyRow.name : "Item";
      const quantity = Number(legacyRow.quantity ?? 0);

      let storeName: string | null = null;
      let countedByName: string | null = null;

      if (storeId) {
        const { data: storeData } = await supabase
          .from("stores")
          .select("id, name")
          .eq("id", storeId)
          .single();
        storeName = storeData?.name || null;
      }

      if (countedBy) {
        const { data: userData } = await supabase
          .from("users")
          .select("id, full_name")
          .eq("id", countedBy)
          .single();
        countedByName = userData?.full_name || null;
      }

      const runPayload = {
        id: runId,
        store_id: storeId,
        initiated_by: countedBy,
        started_at: countedAt,
        completed_at: countedAt,
        item_count: 1,
        notes:
          legacyRun.source === "updated"
            ? `System Correction for ${itemName}`
            : `Physical Count for ${itemName}`,
        store: storeId
          ? {
              id: storeId,
              name: storeName,
            }
          : null,
        initiated_by_user: countedBy
          ? {
              id: countedBy,
              full_name: countedByName,
            }
          : null,
      };

      const itemsPayload = [
        {
          id: `${runId}_line`,
          item_id: legacyRun.itemId,
          previous_quantity: quantity,
          counted_quantity: quantity,
          delta: 0, // Legacy fallback always assumes 0 delta as we lack historical state
          counted_at: countedAt,
          item_name: itemName,
          counted_by_name: countedByName,
          counted_by_user: countedBy
            ? {
                id: countedBy,
                full_name: countedByName,
              }
            : null,
        },
      ];

      res.json({
        run: runPayload,
        items: itemsPayload,
        ...runPayload,
      });
      return;
    }

    const runSelectCandidates = [
      "id, store_id, initiated_by, started_at, completed_at, item_count, notes",
      "id, store_id, initiated_by, started_at, completed_at, item_count",
      "id, store_id, initiated_by, started_at, completed_at, notes",
      "id, store_id, initiated_by, started_at, completed_at",
      "id, store_id, initiated_by, started_at",
    ];

    let runData: Record<string, unknown> | null = null;
    let runError: unknown = null;

    for (const selectClause of runSelectCandidates) {
      const attempt = await supabase
        .from("inventory_reconciliation_runs")
        .select(selectClause)
        .eq("id", runId)
        .single();

      if (!attempt.error && attempt.data) {
        runData = attempt.data as unknown as Record<string, unknown>;
        runError = null;
        break;
      }

      if (attempt.error && isMissingColumnError(attempt.error)) {
        runError = attempt.error;
        continue;
      }

      runError = attempt.error;
      break;
    }

    if (runError) {
      if (isMissingTableError(runError, "inventory_reconciliation_runs")) {
        res.status(404).json({ error: "Reconciliation history is not enabled" });
        return;
      }
      res.status(404).json({ error: "Reconciliation run not found" });
      return;
    }

    if (!runData) {
      res.status(404).json({ error: "Reconciliation run not found" });
      return;
    }

    const itemSelectCandidates = [
      "id, item_id, previous_quantity, counted_quantity, delta, counted_at, counted_by",
      "id, item_id, previous_quantity, counted_quantity, counted_at, counted_by",
      "id, item_id, previous_quantity, counted_quantity, counted_at",
      "id, item_id, counted_quantity, counted_at",
    ];

    let itemsResult: { data: Array<Record<string, unknown>>; error: unknown } = {
      data: [],
      error: null,
    };

    for (const selectClause of itemSelectCandidates) {
      const attempt = await supabase
        .from("inventory_reconciliation_items")
        .select(selectClause)
        .eq("run_id", runId)
        .order("counted_at", { ascending: false });

      if (!attempt.error) {
        itemsResult = { data: (attempt.data || []) as unknown as Array<Record<string, unknown>>, error: null };
        break;
      }

      if (attempt.error && isMissingColumnError(attempt.error)) {
        itemsResult = { data: [], error: attempt.error };
        continue;
      }

      itemsResult = { data: [], error: attempt.error };
      break;
    }

    if (itemsResult.error && !isMissingTableError(itemsResult.error, "inventory_reconciliation_items")) {
      throw itemsResult.error;
    }

    const runStartedAt = typeof runData.started_at === "string" ? runData.started_at : new Date().toISOString();
    const runStoreId = typeof runData.store_id === "string" ? runData.store_id : null;
    const runInitiatedBy = typeof runData.initiated_by === "string" ? runData.initiated_by : null;

    const historyItems = (itemsResult.data || []).map((item) => {
      const previousQuantity = Number(item.previous_quantity ?? 0);
      const countedQuantity = Number(item.counted_quantity ?? 0);
      const rawDelta = item.delta;

      return {
        id: String(item.id || ""),
        item_id: String(item.item_id || ""),
        previous_quantity: previousQuantity,
        counted_quantity: countedQuantity,
        delta: rawDelta == null ? countedQuantity - previousQuantity : Number(rawDelta),
        counted_at: String(item.counted_at || runStartedAt),
        counted_by: typeof item.counted_by === "string" ? item.counted_by : null,
      };
    }) as Array<{
      id: string;
      item_id: string;
      previous_quantity: number;
      counted_quantity: number;
      delta: number;
      counted_at: string;
      counted_by?: string | null;
    }>;

    const itemIds = [...new Set(historyItems.map((item) => item.item_id).filter(Boolean))] as string[];
    const countedByIds = [...new Set(historyItems.map((item) => item.counted_by).filter(Boolean))] as string[];
    const userIds = [...new Set([...(countedByIds || []), runInitiatedBy].filter(Boolean))] as string[];

    const itemNameById = new Map<string, string>();
    const userNameById = new Map<string, string>();
    let storeName: string | null = null;

    if (itemIds.length > 0) {
      const { data: itemsData } = await supabase.from("items").select("id, name").in("id", itemIds);
      for (const row of itemsData || []) {
        itemNameById.set(row.id, row.name);
      }
    }

    if (userIds.length > 0) {
      const { data: usersData } = await supabase.from("users").select("id, full_name").in("id", userIds);
      for (const row of usersData || []) {
        userNameById.set(row.id, row.full_name);
      }
    }

    if (runStoreId) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("id, name")
        .eq("id", runStoreId)
        .single();
      storeName = storeData?.name || null;
    }

    const runPayload = {
      ...runData,
      completed_at: typeof runData.completed_at === "string" ? runData.completed_at : null,
      item_count: Number(runData.item_count ?? historyItems.length),
      notes: typeof runData.notes === "string" ? runData.notes : null,
      store: runStoreId
        ? {
            id: runStoreId,
            name: storeName,
          }
        : null,
      initiated_by_user: runInitiatedBy
        ? {
            id: runInitiatedBy,
            full_name: userNameById.get(runInitiatedBy) || null,
          }
        : null,
    };

    const itemsPayload = historyItems.map((item) => ({
      ...item,
      item_name: itemNameById.get(item.item_id) || null,
      counted_by_name: item.counted_by ? userNameById.get(item.counted_by) || null : null,
      counted_by_user: item.counted_by
        ? {
            id: item.counted_by,
            full_name: userNameById.get(item.counted_by) || null,
          }
        : null,
    }));

    res.json({
      run: runPayload,
      items: itemsPayload,
      ...runPayload,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch reconciliation run details:", error);
    res.status(500).json({
      error: "Failed to fetch reconciliation run details",
      details: extractErrorMessage(error),
    });
  }
});

// PATCH /items/:id — update item
router.patch(
  "/:id",
  requirePermissions("assets", "write"),
  upload.single("image"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Validate body with zod
      const parsed = updateItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const { name, quantity, store_id, description } = parsed.data;
      const file = req.file;

      // Check item exists
      const { data: existingData, error: existingError } = await supabase
        .from("items")
        .select("*")
        .eq("id", id)
        .single();
        
      if (existingError || !existingData) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      if (existingData.deleted_at && !req.body.deleted_at) {
        res.status(400).json({ error: "Cannot update a deleted item. Restore it first." });
        return;
      }

      const currentItem = existingData;
      let imageKey: string = currentItem.image_key;

      // If new image provided, verify and replace
      if (file) {
        // Magic-byte verification
        const detectedType = await fromBuffer(file.buffer);
        if (
          !detectedType ||
          !["image/jpeg", "image/png"].includes(detectedType.mime)
        ) {
          res.status(400).json({
            error: "File content does not match JPEG/PNG format",
          });
          return;
        }

        const newStoreId = store_id ?? currentItem.store_id;
        imageKey = `${newStoreId}/${id}.webp`;

        const compressedBuffer = await sharp(file.buffer)
          .rotate()
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        // Delete old image if key changed
        if (currentItem.image_key && currentItem.image_key !== imageKey) {
          try {
            await deleteImage(currentItem.image_key);
          } catch (storageError) {
            console.error(`Failed to cleanup old image ${currentItem.image_key}:`, storageError);
          }
        }

        await uploadImage(imageKey, compressedBuffer, "image/webp");
      }

      // Build update query dynamically
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (name !== undefined) updates.name = name;
      if (quantity !== undefined) updates.quantity = quantity;
      if (store_id !== undefined) updates.store_id = store_id;
      if (description !== undefined) updates.description = description;
      if (imageKey !== currentItem.image_key) updates.image_key = imageKey;

      if (Object.keys(updates).length > 1) {
        const { data: updatedItem, error } = await supabase
          .from("items")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;

        // If quantity was updated, create an audit record
        if (quantity !== undefined && quantity !== currentItem.quantity) {
          try {
            await ensureAuditTablesExist();
            const nowIso = new Date().toISOString();
            const userId = req.user?.id || null;
            const delta = Number(quantity) - Number(currentItem.quantity);

            // Create a small run for this single update
            const { data: run } = await supabase
              .from("inventory_reconciliation_runs")
              .insert({
                store_id: store_id ?? currentItem.store_id,
                initiated_by: userId,
                started_at: nowIso,
                completed_at: nowIso,
                item_count: 1,
                notes: `Individual quantity update for ${currentItem.name}`,
              })
              .select("id")
              .single();

            if (run?.id) {
              await supabase.from("inventory_reconciliation_items").insert({
                run_id: run.id,
                item_id: id,
                previous_quantity: currentItem.quantity,
                counted_quantity: quantity,
                delta: delta,
                counted_at: nowIso,
                counted_by: userId,
              });
            }
          } catch (auditError) {
            console.error("Failed to log individual update audit:", auditError);
            // Non-blocking for the main update
          }
        }
        
        // Log asset activity
        ActivityService.logActivity({
          entity_type: "asset",
          entity_id: id,
          user_id: req.user?.id || null,
          action: "update",
          note: `Asset "${updatedItem.name}" updated.`,
        });

        res.json({
          ...updatedItem,
          image_url: updatedItem.image_key ? getPublicUrl(updatedItem.image_key) : null,
        });
      } else {
        res.json({
          ...currentItem,
          image_url: currentItem.image_key ? getPublicUrl(currentItem.image_key) : null,
        });
      }
    } catch (error: unknown) {
      console.error("Failed to update item:", error);
      res.status(500).json({
        error: "Failed to update item",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// POST /items/:id/recover — restore soft-deleted item
router.post(
  "/:id/recover", 
  requirePermissions("assets", "write"),
  async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) < 0) {
      res.status(400).json({ error: "A valid positive quantity is required to recover the item" });
      return;
    }

    const nowIso = new Date().toISOString();

    let updatedItem: Record<string, unknown> | null = null;
    let error: unknown = null;

    const withSoftDelete = await supabase
      .from("items")
      .update({ quantity: Number(quantity), deleted_at: null, updated_at: nowIso })
      .eq("id", id)
      .select()
      .single();

    if (!withSoftDelete.error) {
      updatedItem = withSoftDelete.data as Record<string, unknown>;
    } else if (isMissingDeletedAtError(withSoftDelete.error)) {
      const legacyRecover = await supabase
        .from("items")
        .update({ quantity: Number(quantity), updated_at: nowIso })
        .eq("id", id)
        .select()
        .single();
      updatedItem = legacyRecover.data as Record<string, unknown>;
      error = legacyRecover.error;
    } else {
      error = withSoftDelete.error;
    }

    if (error) {
      res.status(404).json({ error: "Item not found or could not be recovered" });
      return;
    }

    res.json({
      ...updatedItem,
      image_url:
        updatedItem && typeof updatedItem.image_key === "string"
          ? getPublicUrl(updatedItem.image_key)
          : null,
    });
  } catch (error: unknown) {
    console.error("Failed to recover item:", error);
    res.status(500).json({
      error: "Failed to recover item",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /items/reconcile — bulk update quantities with count metadata
router.post(
  "/reconcile",
  requirePermissions("assets", "reconcile"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const validated = reconcileItemsSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({ 
          error: "Invalid reconciliation data", 
          details: validated.error.format() 
        });
        return;
      }

      const { items, notes, store_id } = validated.data;

      // Hardening preflight should never block reconciliation path.
      try {
        await ensureAuditTablesExist();
      } catch (preflightError) {
        console.warn("Reconciliation preflight skipped:", preflightError);
      }

      const userId = req.user?.id;
      const results: Array<Record<string, unknown>> = [];
      const failedItemIds: string[] = [];
      const appliedRows: Array<{
        item_id: string;
        previous_quantity: number;
        counted_quantity: number;
        delta: number;
      }> = [];
      const itemIds = [...new Set(items.map((item) => item.id))];
      const previousQuantityById = new Map<string, number>();
      const storeByItemId = new Map<string, string | null>();

      let changedRows = 0;
      let zeroDeltaRows = 0;
      let totalDelta = 0;

      if (itemIds.length > 0) {
        const snapshot = await supabase
          .from("items")
          .select("id, quantity, store_id")
          .in("id", itemIds);

        if (snapshot.error) {
          throw snapshot.error;
        }

        const foundIds = new Set((snapshot.data || []).map((row: { id: string }) => String(row.id || "")));
        const missingIds = itemIds.filter((itemId) => !foundIds.has(itemId));
        if (missingIds.length > 0) {
          res.status(400).json({
            error: "Some items no longer exist and could not be reconciled",
            missing_item_ids: missingIds,
          });
          return;
        }

        for (const row of snapshot.data || []) {
          previousQuantityById.set(row.id, Number(row.quantity || 0));
          storeByItemId.set(row.id, row.store_id || null);
        }
      }

      for (const item of items) {
        const nowIso = new Date().toISOString();

        // Check if item exists (including soft-deleted)
        const { data: checkItem } = await supabase
          .from("items")
          .select("id, deleted_at, quantity")
          .eq("id", item.id)
          .single();

        const sourceRunId = typeof item.source_run_id === "string" ? item.source_run_id.trim() : "";
        const hasCanonicalSourceRunId = /^[0-9a-fA-F-]{36}$/.test(sourceRunId);
        let expectedCurrentQuantity =
          typeof item.expected_current_quantity === "number"
            ? Number(item.expected_current_quantity)
            : null;

        if (hasCanonicalSourceRunId) {
          const latestAuditResult = await supabase
            .from("inventory_reconciliation_items")
            .select("run_id, counted_quantity, counted_at, created_at")
            .eq("item_id", item.id)
            .order("counted_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!latestAuditResult.error && latestAuditResult.data) {
            const latestRunId = typeof latestAuditResult.data.run_id === "string" ? latestAuditResult.data.run_id : "";
            if (!latestRunId || latestRunId !== sourceRunId) {
              failedItemIds.push(item.id);
              console.warn("Skipping stale source-run reconciliation row", {
                item_id: item.id,
                source_run_id: sourceRunId,
                latest_run_id: latestRunId || null,
              });
              continue;
            }

            if (expectedCurrentQuantity === null) {
              const latestCounted = Number(latestAuditResult.data.counted_quantity ?? Number.NaN);
              if (Number.isFinite(latestCounted)) {
                expectedCurrentQuantity = latestCounted;
              }
            }
          } else if (
            latestAuditResult.error &&
            !isMissingTableError(latestAuditResult.error, "inventory_reconciliation_items") &&
            !isMissingColumnError(latestAuditResult.error)
          ) {
            throw latestAuditResult.error;
          }
        }

        const actualCurrentQuantity = Number(checkItem?.quantity ?? Number.NaN);

        // Guarded reconciliation (used by undo) only applies if item quantity still matches
        // the expected latest state from the selected audit row.
        if (
          expectedCurrentQuantity !== null &&
          (!Number.isFinite(actualCurrentQuantity) || actualCurrentQuantity !== expectedCurrentQuantity)
        ) {
          failedItemIds.push(item.id);
          console.warn("Skipping stale guarded reconciliation row", {
            item_id: item.id,
            expected_current_quantity: expectedCurrentQuantity,
            actual_current_quantity: actualCurrentQuantity,
          });
          continue;
        }

        // Update item with quantity and reconciliation metadata
        const updatePayload: Record<string, any> = {
          quantity: item.quantity,
          updated_at: nowIso,
          last_counted_at: nowIso,
          last_counted_by: userId || null,
        };

        // If item was soft-deleted, restore it during reconciliation
        if (checkItem?.deleted_at) {
          updatePayload.deleted_at = null;
        }

        const fullUpdate = await supabase
          .from("items")
          .update(updatePayload)
          .eq("id", item.id)
          .select()
          .single();

        let data = fullUpdate.data;
        let error = fullUpdate.error;

        if (error && isMissingLastCountedAtError(error)) {
          const fallback = await supabase
            .from("items")
            .update({
              quantity: item.quantity,
              updated_at: nowIso,
            })
            .eq("id", item.id)
            .select()
            .single();
          data = fallback.data;
          error = fallback.error;
        }

        if (!error && data) {
          results.push(data as Record<string, unknown>);

          const baselineQty = previousQuantityById.get(item.id);
          const actualPreviousQty = Number(baselineQty ?? checkItem?.quantity ?? 0);
          const countedQty = Number(item.quantity || 0);
          const delta = countedQty - actualPreviousQty;

          appliedRows.push({
            item_id: item.id,
            previous_quantity: actualPreviousQty,
            counted_quantity: countedQty,
            delta,
          });

          totalDelta += delta;
          if (delta === 0) {
            zeroDeltaRows += 1;
          } else {
            changedRows += 1;
          }
        } else {
          failedItemIds.push(item.id);
          console.warn("Skipping failed reconciliation row", {
            item_id: item.id,
            error: error ? extractErrorMessage(error) : "Unknown update error",
          });
          continue;
        }
      }

      if (results.length === 0 && failedItemIds.length === items.length) {
        res.status(409).json({
          error: "Reconciliation conflict",
          details: "No rows were applied because item quantities changed since the selected audit state.",
          failed_item_ids: failedItemIds,
        });
        return;
      }

      // Audit persistence must succeed for the UI to claim a committed ledger run.
      let persistedRunId: string | null = null;
      let resolvedStoreId: string | null = null;
      let auditCommitted = false;
      let auditWarning: string | null = null;

      if (results.length > 0) {
        const nowIso = new Date().toISOString();
        const storeCandidates = [...new Set(appliedRows.map((row) => storeByItemId.get(row.item_id)).filter(Boolean))] as string[];
        const runStoreId = store_id ?? (storeCandidates.length === 1 ? storeCandidates[0] : null);
        resolvedStoreId = runStoreId;

        const runInsertPayloads: Array<Record<string, unknown>> = [
          {
            store_id: runStoreId,
            initiated_by: userId || null,
            started_at: nowIso,
            completed_at: nowIso,
            item_count: results.length,
            notes: notes ?? null,
          },
        ];

        let runInsert: { data: { id: string } | null; error: unknown } = { data: null, error: null };

        for (const payload of runInsertPayloads) {
          const attempt = await supabase
            .from("inventory_reconciliation_runs")
            .insert(payload)
            .select("id")
            .single();

          if (!attempt.error && attempt.data?.id) {
            runInsert = { data: { id: attempt.data.id }, error: null };
            break;
          }

          runInsert = { data: null, error: attempt.error };
          if (!attempt.error || !isMissingColumnError(attempt.error)) {
            break;
          }
        }

        if (!runInsert.error && runInsert.data?.id) {
          const runInsertId = runInsert.data.id;
          persistedRunId = runInsertId;

          const fullAuditRows = appliedRows.map((row) => ({
            run_id: runInsertId,
            item_id: row.item_id,
            previous_quantity: row.previous_quantity,
            counted_quantity: row.counted_quantity,
            delta: row.delta,
            counted_at: nowIso,
            counted_by: userId || null,
          }));

          if (fullAuditRows.length > 0) {
            const auditRowCandidates: Array<Array<Record<string, unknown>>> = [
              fullAuditRows,
            ];

            let auditInsertError: unknown = null;
            for (const rows of auditRowCandidates) {
              const attempt = await supabase.from("inventory_reconciliation_items").insert(rows);
              if (!attempt.error) {
                auditInsertError = null;
                break;
              }

              auditInsertError = attempt.error;
              if (!isMissingColumnError(attempt.error)) {
                break;
              }
            }

            if (auditInsertError) {
              if (isMissingTableError(auditInsertError, "inventory_reconciliation_items")) {
                auditWarning = "Audit ledger line-items table is currently unavailable.";
              } else {
                throw auditInsertError;
              }
            } else {
              auditCommitted = true;
            }
          } else {
            auditCommitted = true;
          }
        } else if (runInsert.error) {
          if (isMissingTableError(runInsert.error, "inventory_reconciliation_runs")) {
            auditWarning = "Audit ledger is temporarily unavailable. Counts were saved without a run entry.";
          } else {
            throw runInsert.error;
          }
        }
      }

      if (results.length > 0 && !persistedRunId && !auditWarning) {
        throw new Error("Reconciliation run was applied but audit ledger entry was not created");
      }

      // Emit notifications on discrepancies
      if (results.length > 0 && changedRows > 0) {
        NotificationsService.emitNotificationToRoleOrPermission({
          permissionSlug: "assets:reconcile",
          actor_id: req.user?.id,
          title: "Reconciliation Discrepancy",
          message: `Inventory reconciliation run (ID: ${persistedRunId || "N/A"}) detected discrepancies on ${changedRows} items. Total delta: ${totalDelta}.`,
          entity_type: "inventory",
          entity_id: persistedRunId || undefined,
          action_url: "/inventory/reconciliation",
        });
      }

      // Log reconciliation activity
      ActivityService.logActivity({
        entity_type: "asset",
        entity_id: persistedRunId || "00000000-0000-0000-0000-000000000000",
        user_id: req.user?.id || null,
        action: "reconcile",
        note: `Bulk recount reconciliation run committed. ${changedRows} items modified. Total delta: ${totalDelta}.`,
      });

      res.json({
        success: true,
        count: results.length,
        run_id: persistedRunId,
        audit_committed: auditCommitted,
        audit_warning: auditWarning,
        failed_item_ids: failedItemIds,
        summary: {
          changed_rows: changedRows,
          zero_delta_rows: zeroDeltaRows,
          total_delta: totalDelta,
          notes: notes ?? null,
          store_id: resolvedStoreId,
        },
      });
    } catch (error: unknown) {
      console.error("Failed to reconcile items:", error);
      res.status(500).json({
        error: "Reconciliation failed",
        details: extractErrorMessage(error),
      });
    }
  }
);

// DELETE /items/:id — delete item + storage object
router.delete(
  "/:id",
  requirePermissions("assets", "delete"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Get item to find image key (but don't delete the image for soft deletes)
      const currentActive = await supabase
        .from("items")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      let item = currentActive.data;
      let existingError = currentActive.error;

      if (existingError && isMissingDeletedAtError(existingError)) {
        const legacyCurrent = await supabase
          .from("items")
          .select("*")
          .eq("id", id)
          .neq("quantity", -999999)
          .single();
        item = legacyCurrent.data;
        existingError = legacyCurrent.error;
      }
        
      if (existingError || !item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      // Soft delete: set deleted_at
      const deleteResult = await supabase
        .from("items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);

      let deleteError = deleteResult.error;

      if (deleteError && isMissingDeletedAtError(deleteError)) {
        const legacyDelete = await supabase
          .from("items")
          .update({ quantity: -999999, updated_at: new Date().toISOString() })
          .eq("id", id);
        deleteError = legacyDelete.error;
      }
        
      if (deleteError) throw deleteError;

      res.json({ success: true });
    } catch (error: unknown) {
      console.error("Failed to delete item:", error);
      res.status(500).json({
        error: "Failed to delete item",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// POST /items/bulk-delete — delete multiple items at once
router.post(
  "/bulk-delete",
  requirePermissions("assets", "delete"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids array is required" });
        return;
      }

      // Soft delete from DB
      const softDelete = await supabase
        .from("items")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);

      let deleteError = softDelete.error;

      if (deleteError && isMissingDeletedAtError(deleteError)) {
        const legacyDelete = await supabase
          .from("items")
          .update({ quantity: -999999, updated_at: new Date().toISOString() })
          .in("id", ids);
        deleteError = legacyDelete.error;
      }

      if (deleteError) throw deleteError;

      res.json({ success: true, deleted: ids.length });
    } catch (error: unknown) {
      console.error("Failed to bulk delete:", error);
      res.status(500).json({
        error: "Bulk delete failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// DELETE /items/:id/permanent — permanently delete an item from DB and storage
router.delete(
  "/:id/permanent",
  requirePermissions("assets", "delete"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { data: existing, error: fetchError } = await supabase
        .from("items")
        .select("id, image_key")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      const { error: deleteError } = await supabase
        .from("items")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      if (existing.image_key) {
        try {
          await deleteImage(existing.image_key);
        } catch (storageError) {
          console.warn("Permanent delete succeeded but storage cleanup failed:", storageError);
        }
      }

      res.json({ success: true, permanently_deleted: true });
    } catch (error: unknown) {
      console.error("Failed to permanently delete item:", error);
      res.status(500).json({
        error: "Permanent delete failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// POST /items/:id/rotate — rotate image 90° clockwise
router.post(
  "/:id/rotate",
  requirePermissions("assets", "write"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Get item
      const currentActive = await supabase
        .from("items")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      let item = currentActive.data;
      let fetchError = currentActive.error;

      if (fetchError && isMissingDeletedAtError(fetchError)) {
        const legacyCurrent = await supabase
          .from("items")
          .select("*")
          .eq("id", id)
          .neq("quantity", -999999)
          .single();
        item = legacyCurrent.data;
        fetchError = legacyCurrent.error;
      }

      if (fetchError || !item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }

      if (!item.image_key) {
        res.status(400).json({ error: "Item has no image" });
        return;
      }

      // Download current image
      const currentBuffer = await downloadImage(item.image_key);

      // Rotate 90° clockwise and re-encode as WebP
      const rotatedBuffer = await sharp(currentBuffer)
        .rotate(90)
        .webp({ quality: 80 })
        .toBuffer();

      // Ensure key ends in .webp
      const newKey = item.image_key.replace(/\.(jpg|jpeg|png)$/i, ".webp");

      // Re-upload
      await uploadImage(newKey, rotatedBuffer, "image/webp");

      // Update DB key if it changed
      if (newKey !== item.image_key) {
        await supabase
          .from("items")
          .update({ image_key: newKey, updated_at: new Date().toISOString() })
          .eq("id", id);

        // Clean up old file
        try {
          await deleteImage(item.image_key);
        } catch {
          // best-effort
        }
      } else {
        await supabase
          .from("items")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", id);
      }

      res.json({
        ...item,
        image_key: newKey,
        image_url: getPublicUrl(newKey),
      });
    } catch (error: unknown) {
      console.error("Failed to rotate image:", error);
      res.status(500).json({
        error: "Failed to rotate image",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
