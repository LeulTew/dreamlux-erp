import { Router, Response } from "express";
import multer from "multer";
import sharp from "sharp";
// @ts-expect-error -- uuid types friction in ESM/CJS
import { v4 as uuidv4 } from "uuid";
import { fromBuffer } from "file-type";
import { supabase } from "../db/supabase";
import { uploadImage, deleteImage, getPublicUrl, downloadImage } from "../storage/storage";
import { AuthRequest, requirePermissionSlugs } from "../middleware/auth";
import { ActivityService } from "../services/activity-service";
import { NotificationsService } from "../services/notifications-service";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeePaginationSchema,
} from "../lib/validation";
import { generateNextEmployeeId } from "../lib/id-generator";
import { ZodError } from "zod";

const router = Router();

// GET /employees/next-id — generate suggested sequential ID
router.get("/next-id", async (_req, res) => {
  try {
    const prefix = (_req.query.prefix as string) || undefined;
    const nextId = await generateNextEmployeeId(prefix);
    res.json({ nextId });
  } catch {
    res.status(500).json({ error: "Failed to generate ID" });
  }
});

interface EmployeeRow {
  id: string;
  full_name: string;
  employee_id: string;
  department: string | null;
  phone: string | null;
  email: string | null;
  id_card_front_key: string | null;
  id_card_back_key: string | null;
  profile_photo_key: string | null;
  commission: number;
  salary_level: string | null;
  salary_level_id: string | null;
  event_prices: Record<string, number> | null;
  stores?: { name: string } | null;
  salary_levels?: { amount_etb: number } | null;
}

async function resolveSalaryLevelIdByCode(code: string): Promise<string | null> {
  if (!code || typeof code !== "string") return null;

  const { data, error } = await supabase
    .from("salary_levels")
    .select("id")
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.warn(`[Employees] Failed to resolve salary_level_id for code=${code}:`, error.message || error);
    return null;
  }

  return data?.id ?? null;
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png" || file.mimetype === "image/webp") {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG and WebP images are allowed"));
    }
  },
});

const cpUpload = upload.fields([
  { name: "id_card_front", maxCount: 1 },
  { name: "id_card_back", maxCount: 1 },
  { name: "profile_photo", maxCount: 1 },
]);

// POST /employees — create employee with images
router.post(
  "/",
  requirePermissionSlugs(["hr:write"]),
  cpUpload,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const keysToCleanup: string[] = [];

    try {
      // Validate body with zod
      const parsed = createEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const { full_name, employee_id, department_id, office_id, phone, email, commission, salary_level, event_prices } = parsed.data;
      const salaryLevelId = salary_level && salary_level !== "" ? await resolveSalaryLevelIdByCode(salary_level) : null;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const frontFile = files?.["id_card_front"]?.[0];
      const backFile = files?.["id_card_back"]?.[0];
      const profileFile = files?.["profile_photo"]?.[0];

      async function processAndUploadImage(file: Express.Multer.File, suffix: string): Promise<string> {
        const detectedType = await fromBuffer(file.buffer);
        if (!detectedType || !["image/jpeg", "image/png", "image/webp"].includes(detectedType.mime)) {
          throw new Error(`File ${file.fieldname} is not a valid image`);
        }

        const imageKey = `employees/${employee_id}/${uuidv4()}_${suffix}.webp`;
        const compressedBuffer = await sharp(file.buffer)
          .rotate()
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        await uploadImage(imageKey, compressedBuffer, "image/webp");
        keysToCleanup.push(imageKey);
        return imageKey;
      }

      let frontKey: string | null = null;
      let backKey: string | null = null;
      let profileKey: string | null = null;

      if (frontFile) {
        frontKey = await processAndUploadImage(frontFile, "front");
      }

      if (backFile) {
        backKey = await processAndUploadImage(backFile, "back");
      }
      if (profileFile) {
        profileKey = await processAndUploadImage(profileFile, "profile");
      }

      const cloneFromId = req.body.clone_from_id as string | undefined;
      if (cloneFromId) {
        const { data: sourceEmp } = await supabase
          .from("employees")
          .select("id_card_front_key, id_card_back_key, profile_photo_key")
          .eq("id", cloneFromId)
          .single();

        if (sourceEmp) {
          if (sourceEmp.id_card_front_key && !frontFile) {
            try {
              const buffer = await downloadImage(String(sourceEmp.id_card_front_key));
              frontKey = `employees/${employee_id}/${uuidv4()}_front.webp`;
              await uploadImage(frontKey, buffer, "image/webp");
              keysToCleanup.push(frontKey);
            } catch (err) {
              console.warn(`[Employees] Failed to clone front ID photo:`, err);
            }
          }
          if (sourceEmp.id_card_back_key && !backFile) {
            try {
              const buffer = await downloadImage(String(sourceEmp.id_card_back_key));
              backKey = `employees/${employee_id}/${uuidv4()}_back.webp`;
              await uploadImage(backKey, buffer, "image/webp");
              keysToCleanup.push(backKey);
            } catch (err) {
              console.warn(`[Employees] Failed to clone back ID photo:`, err);
            }
          }
          if (sourceEmp.profile_photo_key && !profileFile) {
            try {
              const buffer = await downloadImage(String(sourceEmp.profile_photo_key));
              profileKey = `employees/${employee_id}/${uuidv4()}_profile.webp`;
              await uploadImage(profileKey, buffer, "image/webp");
              keysToCleanup.push(profileKey);
            } catch (err) {
              console.warn(`[Employees] Failed to clone profile photo:`, err);
            }
          }
        }
      }

      let parsedEventPrices: Record<string, number> | undefined;
      if (event_prices !== undefined) {
        if (typeof event_prices === "string") {
          const trimmed = event_prices.trim();
          if (trimmed.length === 0) {
            parsedEventPrices = {};
          } else {
            try {
              const raw = JSON.parse(trimmed) as Record<string, unknown>;
              const normalized = Object.fromEntries(
                Object.entries(raw || {}).map(([key, value]) => [key, Number(value ?? 0)])
              );
              const hasInvalidValue = Object.values(normalized).some(
                (value) => !Number.isFinite(value) || value < 0
              );
              if (hasInvalidValue) {
                res.status(400).json({ error: "Invalid event_prices payload" });
                return;
              }
              parsedEventPrices = normalized;
            } catch {
              res.status(400).json({ error: "Invalid event_prices payload" });
              return;
            }
          }
        } else {
          parsedEventPrices = event_prices as Record<string, number>;
        }
      }

      const payload: Record<string, unknown> = {
        full_name,
        employee_id,
        department_id: (department_id && department_id !== "") ? department_id : null,
        office_id: (office_id && office_id !== "") ? office_id : null,
        phone: phone ?? null,
        email: email ?? null,
        id_card_front_key: frontKey,
        id_card_back_key: backKey,
        profile_photo_key: profileKey,
        commission: commission ?? 0,
        salary_level: salary_level ?? null,
        salary_level_id: salaryLevelId,
        event_prices: parsedEventPrices ?? {},
      };

      const extractMissingColumnName = (error: unknown): string | null => {
        const maybeError = error as { message?: string; details?: string; hint?: string };
        const text = `${maybeError?.message ?? ""} ${maybeError?.details ?? ""} ${maybeError?.hint ?? ""}`;
        const patterns = [
          /column\s+["']?([a-zA-Z0-9_]+)["']?\s+(?:of relation\s+["']?[a-zA-Z0-9_]+["']?\s+)?does not exist/i,
          /Could not find the\s+["']([a-zA-Z0-9_]+)["']\s+column/i,
          /schema cache.*?["']([a-zA-Z0-9_]+)["']/i,
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match?.[1]) return match[1];
        }
        return null;
      };

      const retryablePayload = { ...payload };
      const droppedColumns: string[] = [];
      const autoMigrationTried = new Set<string>();
      let employeeData: Record<string, unknown> | null = null;
      let insertError: unknown = null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        // Insert employee
        const result = await supabase
          .from("employees")
          .insert(retryablePayload)
          .select()
          .single();

        if (!result.error) {
          employeeData = result.data as Record<string, unknown>;
          insertError = null;
          break;
        }

        insertError = result.error;
        const missingColumn = extractMissingColumnName(result.error);
        if (!missingColumn || !(missingColumn in retryablePayload)) {
          break;
        }

        if (missingColumn === "event_prices" && !autoMigrationTried.has("event_prices")) {
          autoMigrationTried.add("event_prices");
          try {
            const rpcResult = await supabase.rpc("exec_sql", {
              sql: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS event_prices JSONB DEFAULT '{}'::jsonb",
            });
            if (!rpcResult.error) {
              continue;
            }
            console.warn("[POST employee] Auto-migration RPC failed:", rpcResult.error.message);
          } catch (rpcError) {
            console.warn("[POST employee] Auto-migration RPC unavailable:", rpcError);
          }
        }

        delete retryablePayload[missingColumn];
        droppedColumns.push(missingColumn);
      }

      if (insertError || !employeeData) throw insertError;

      NotificationsService.emitNotificationToRoleOrPermission({
        permissionSlug: "hr:read",
        actor_id: req.user?.id,
        title: "New Employee Created",
        message: `${full_name} (${employee_id}) has been added to the system.`,
        entity_type: "employee",
        entity_id: String(employeeData.id),
      });

      res.status(201).json({
        ...employeeData,
        id_card_front_url: employeeData.id_card_front_key ? getPublicUrl(String(employeeData.id_card_front_key)) : null,
        id_card_back_url: employeeData.id_card_back_key ? getPublicUrl(String(employeeData.id_card_back_key)) : null,
        profile_photo_url: employeeData.profile_photo_key ? getPublicUrl(String(employeeData.profile_photo_key)) : null,
        ...(droppedColumns.length > 0 ? { _dropped_columns: droppedColumns } : {}),
        ...(droppedColumns.length > 0
          ? { _warning: `Some fields were skipped because this database is on an older schema: ${droppedColumns.join(", ")}` }
          : {}),
      });
    } catch (error: unknown) {
      // Cleanup
      for (const key of keysToCleanup) {
        try {
          await deleteImage(key);
        } catch (storageError) {
          console.error(`Failed to cleanup storage for key ${key}:`, storageError);
        }
      }
      res.status(500).json({
        error: "Failed to create employee",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// GET /employees — list employees
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pagination = employeePaginationSchema.parse(req.query);
    const { page, limit, search, status, office_id, department_id, sortBy, sortOrder } = pagination;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("employees")
      .select("*, stores!office_id(name), salary_levels!salary_level_id(amount_etb)", { count: "exact" });

    if (status === "trash") {
      query = query.not("deleted_at", "is", null);
    } else {
      query = query.is("deleted_at", null);
    }

    if (department_id && department_id !== "all") {
      query = query.eq("department_id", department_id);
    }

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,employee_id.ilike.%${search}%,department.ilike.%${search}%`);
    }

    if (office_id && office_id !== "all") {
      query = query.eq("office_id", office_id);
    }

    // Default sorting and provided sort
    if (sortBy === "salary") {
      query = query.order("amount_etb", { ascending: sortOrder === "asc", referencedTable: "salary_levels", nullsFirst: false });
    } else if (sortBy === "name" || sortBy === "full_name") {
      query = query.order("full_name", { ascending: sortOrder === "asc" });
    } else if (sortBy === "date") {
      query = query.order("created_at", { ascending: sortOrder === "asc" });
    } else if (sortBy === "employee_id") {
      query = query.order("employee_id", { ascending: sortOrder === "asc" });
    } else if (sortBy === "commission") {
      query = query.order("commission", { ascending: sortOrder === "asc" });
    } else {
      // Default: Salary High to Low per request
      query = query.order("amount_etb", { ascending: false, referencedTable: "salary_levels", nullsFirst: false });
      query = query.order("created_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: resultData, error: queryError, count } = await query;
    let finalData = resultData;
    let finalCount = count;

    const { data: allSalaryLevels, error: salaryLevelError } = await supabase
      .from("salary_levels")
      .select("code, amount_etb")
      .is("deleted_at", null);
    const salaryByCode = new Map<string, number>();
    if (!salaryLevelError) {
      for (const row of allSalaryLevels ?? []) {
        if (typeof row?.code === "string") {
          salaryByCode.set(row.code, Number(row.amount_etb ?? 0));
        }
      }
    }

    // SCHEMA COMPATIBLITY FALLBACK
    // Handle cases where the migration hasn't been applied or multiple relationships exist.
    if (queryError && (queryError.message.includes("column") || queryError.message.includes("relationship") || queryError.message.includes("embed"))) {
      console.warn(`[Compatibility Mode] Employees query fallback triggered. Error: ${queryError.message}`);

      // Re-build a safe query for legacy schema
      let fallbackQuery = supabase
        .from("employees")
        .select("*, stores!office_id(name)", { count: "exact" });

      // Apply same filters
      if (status === "trash") fallbackQuery = fallbackQuery.not("deleted_at", "is", null);
      else fallbackQuery = fallbackQuery.is("deleted_at", null);

      if (department_id && department_id !== "all") fallbackQuery = fallbackQuery.eq("department_id", department_id);
      if (office_id && office_id !== "all") fallbackQuery = fallbackQuery.eq("office_id", office_id);
      if (search) fallbackQuery = fallbackQuery.or(`full_name.ilike.%${search}%,employee_id.ilike.%${search}%,department.ilike.%${search}%`);

      // Apply safe sorts (Legacy column is base_salary)
      if (sortBy === "salary") {
        fallbackQuery = fallbackQuery.order("base_salary", { ascending: sortOrder === "asc" });
      } else if (sortBy === "name" || sortBy === "full_name") {
        fallbackQuery = fallbackQuery.order("full_name", { ascending: sortOrder === "asc" });
      } else if (sortBy === "employee_id") {
        fallbackQuery = fallbackQuery.order("employee_id", { ascending: sortOrder === "asc" });
      } else if (sortBy === "commission") {
        fallbackQuery = fallbackQuery.order("commission", { ascending: sortOrder === "asc" });
      } else if (sortBy === "date" || !sortBy) {
        fallbackQuery = fallbackQuery.order("created_at", { ascending: sortOrder === "asc" });
      } else {
        fallbackQuery = fallbackQuery.order("base_salary", { ascending: false });
      }

      const res1 = await fallbackQuery.range(offset, offset + limit - 1);

      if (res1.error) {
        console.warn(`[Compatibility Mode] Secondary fallback triggered. Error: ${res1.error.message}`);
        // Ultra-safe: No joins, just raw data
        let ultraFallback = supabase.from("employees").select("*", { count: "exact" });
        if (status === "trash") ultraFallback = ultraFallback.not("deleted_at", "is", null);
        else ultraFallback = ultraFallback.is("deleted_at", null);

        if (department_id && department_id !== "all") ultraFallback = ultraFallback.eq("department_id", department_id);
        if (office_id && office_id !== "all") ultraFallback = ultraFallback.eq("office_id", office_id);
        if (search) ultraFallback = ultraFallback.or(`full_name.ilike.%${search}%,employee_id.ilike.%${search}%,department.ilike.%${search}%`);

        if (sortBy === "salary") {
          ultraFallback = ultraFallback.order("base_salary", { ascending: sortOrder === "asc" });
        } else if (sortBy === "name" || sortBy === "full_name") {
          ultraFallback = ultraFallback.order("full_name", { ascending: sortOrder === "asc" });
        } else if (sortBy === "employee_id") {
          ultraFallback = ultraFallback.order("employee_id", { ascending: sortOrder === "asc" });
        } else if (sortBy === "commission") {
          ultraFallback = ultraFallback.order("commission", { ascending: sortOrder === "asc" });
        } else if (sortBy === "date" || !sortBy) {
          ultraFallback = ultraFallback.order("created_at", { ascending: sortOrder === "asc" });
        } else {
          ultraFallback = ultraFallback.order("base_salary", { ascending: false });
        }

        const res2 = await ultraFallback.range(offset, offset + limit - 1);
        finalData = res2.data;
        finalCount = res2.count;
        if (res2.error) throw res2.error;
      } else {
        finalData = res1.data;
        finalCount = res1.count;
      }
    } else if (queryError) {
      throw queryError;
    }

    const employees = (finalData as unknown as EmployeeRow[]).map((row) => {
      const salaryCode = (row as unknown as Record<string, string | null>).salary_level ?? "";
      const resolvedSalary = row.salary_levels?.amount_etb ?? salaryByCode.get(salaryCode) ?? (row as unknown as Record<string, number>).base_salary ?? 0;
      return {
        ...row,
        office: (row as unknown as Record<string, {name: string} | null>).stores?.name || (row as unknown as Record<string, string>).office_snapshot || null,
        base_salary: resolvedSalary,
        id_card_front_url: row.id_card_front_key ? getPublicUrl(row.id_card_front_key) : null,
        id_card_back_url: row.id_card_back_key ? getPublicUrl(row.id_card_back_key) : null,
        profile_photo_url: row.profile_photo_key ? getPublicUrl(row.profile_photo_key) : null,
        event_prices: (row as unknown as Record<string, Record<string, number>>).event_prices || {},
      };
    });

    res.json({ employees, total: finalCount || 0, page, limit });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Invalid employee query parameters",
        details: error.issues.map((issue) => issue.message),
      });
      return;
    }

    console.error("Failed to fetch employees:", error);
    res.status(500).json({
      error: "Failed to fetch employees",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /employees/:id — get employee detail
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("employees")
      .select("*, salary_levels!salary_level_id(amount_etb)")
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    const salaryCode = (data as Record<string, string | null>).salary_level ?? "";
    const joinedAmount = data.salary_levels?.amount_etb;
    let baseSalary = joinedAmount != null ? Number(joinedAmount) : Number((data as Record<string, unknown>).base_salary ?? 0);

    if (salaryCode && joinedAmount == null) {
      const { data: salaryData, error: salaryError } = await supabase
        .from("salary_levels")
        .select("amount_etb")
        .eq("code", salaryCode)
        .is("deleted_at", null)
        .maybeSingle();

      if (!salaryError && salaryData?.amount_etb != null) {
        baseSalary = Number(salaryData.amount_etb);
      }
    }

    res.json({
      ...data,
      base_salary: baseSalary,
      id_card_front_url: data.id_card_front_key ? getPublicUrl(data.id_card_front_key) : null,
      id_card_back_url: data.id_card_back_key ? getPublicUrl(data.id_card_back_key) : null,
      profile_photo_url: data.profile_photo_key ? getPublicUrl(data.profile_photo_key) : null,
    });
  } catch (error: unknown) {
    res.status(500).json({
      error: "Internal error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// PATCH /employees/:id — update employee
router.patch(
  "/:id",
  requirePermissionSlugs(["hr:write"]),
  cpUpload,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const extractMissingColumnName = (error: unknown): string | null => {
        const maybeError = error as { message?: string; details?: string; hint?: string };
        const text = `${maybeError?.message ?? ""} ${maybeError?.details ?? ""} ${maybeError?.hint ?? ""}`;
        const patterns = [
          /column\s+["']?([a-zA-Z0-9_]+)["']?\s+(?:of relation\s+["']?[a-zA-Z0-9_]+["']?\s+)?does not exist/i,
          /Could not find the\s+["']([a-zA-Z0-9_]+)["']\s+column/i,
          /schema cache.*?["']([a-zA-Z0-9_]+)["']/i,
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match?.[1]) return match[1];
        }
        return null;
      };

      const { id } = req.params;
      const parsed = updateEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const { data: existing, error: fetchError } = await supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }

      const { full_name, employee_id, department_id, office_id, phone, email, commission, salary_level, event_prices } = parsed.data;
      let parsedEventPrices: Record<string, number> | undefined;
      if (event_prices !== undefined) {
        if (typeof event_prices === "string") {
          const trimmed = event_prices.trim();
          if (trimmed.length === 0) {
            parsedEventPrices = {};
          } else {
            try {
              const raw = JSON.parse(trimmed) as Record<string, unknown>;
              const normalized = Object.fromEntries(
                Object.entries(raw || {}).map(([key, value]) => [key, Number(value ?? 0)])
              );
              const hasInvalidValue = Object.values(normalized).some(
                (value) => !Number.isFinite(value) || value < 0
              );
              if (hasInvalidValue) {
                res.status(400).json({ error: "Invalid event_prices payload" });
                return;
              }
              parsedEventPrices = normalized;
            } catch {
              res.status(400).json({ error: "Invalid event_prices payload" });
              return;
            }
          }
        } else {
          parsedEventPrices = event_prices as Record<string, number>;
        }
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const frontFile = files?.["id_card_front"]?.[0];
      const backFile = files?.["id_card_back"]?.[0];
      const profileFile = files?.["profile_photo"]?.[0];

      const updates: Record<string, unknown> = {
        full_name,
        employee_id,
        department_id: department_id || null,
        office_id: office_id || null,
        phone,
        email,
        commission: commission ? Number(commission) : undefined,
        salary_level: salary_level || null,
        event_prices: parsedEventPrices,
        updated_at: new Date().toISOString()
      };

      async function processAndUploadImage(file: Express.Multer.File, suffix: string, oldKey?: string): Promise<string> {
        const empId = (updates.employee_id as string | undefined) || existing.employee_id;
        const imageKey = `employees/${empId}/${uuidv4()}_${suffix}.webp`;
        const compressedBuffer = await sharp(file.buffer)
          .rotate()
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        await uploadImage(imageKey, compressedBuffer, "image/webp");
        if (oldKey) {
          try {
            await deleteImage(oldKey);
          } catch (storageError) {
            console.error(`Failed to delete old image ${oldKey}:`, storageError);
          }
        }
        return imageKey;
      }

      if (frontFile) {
        updates.id_card_front_key = await processAndUploadImage(frontFile, "front", existing.id_card_front_key);
      }
      if (backFile) {
        updates.id_card_back_key = await processAndUploadImage(backFile, "back", existing.id_card_back_key);
      }
      if (profileFile) {
        updates.profile_photo_key = await processAndUploadImage(profileFile, "profile", existing.profile_photo_key);
      }

      // Strip undefined fields so Supabase doesn't fail
      const finalUpdates = Object.fromEntries(
        Object.entries({ ...updates }).filter(([, v]) => v !== undefined)
      );
      if (finalUpdates.department_id === "") finalUpdates.department_id = null;
      if (finalUpdates.office_id === "") finalUpdates.office_id = null;
      delete (finalUpdates as Record<string, unknown>).commission_type;

      const retryableUpdates = { ...(finalUpdates as Record<string, unknown>) };
      const droppedColumns: string[] = [];
      const autoMigrationTried = new Set<string>();
      let updated: Record<string, unknown> | null = null;
      let updateError: unknown = null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await supabase
          .from("employees")
          .update(retryableUpdates)
          .eq("id", id)
          .select()
          .single();

        if (!result.error) {
          updated = result.data as Record<string, unknown>;
          updateError = null;
          break;
        }

        updateError = result.error;
        const missingColumn = extractMissingColumnName(result.error);
        if (!missingColumn || !(missingColumn in retryableUpdates)) {
          break;
        }

        if (missingColumn === "event_prices" && !autoMigrationTried.has("event_prices")) {
          autoMigrationTried.add("event_prices");
          try {
            const rpcResult = await supabase.rpc("exec_sql", {
              sql: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS event_prices JSONB DEFAULT '{}'::jsonb",
            });
            if (!rpcResult.error) {
              // Column creation succeeded, retry full update payload with event_prices included.
              continue;
            }
            console.warn("[PATCH employee] Auto-migration RPC failed:", rpcResult.error.message);
          } catch (rpcError) {
            console.warn("[PATCH employee] Auto-migration RPC unavailable:", rpcError);
          }
        }

        delete retryableUpdates[missingColumn];
        droppedColumns.push(missingColumn);
      }

      if (updateError || !updated) {
        console.error("[PATCH employee] Supabase update error:", JSON.stringify(updateError));
        throw updateError;
      }

      // Log employee update activity
      ActivityService.logActivity({
        entity_type: "employee",
        entity_id: id,
        user_id: req.user?.id || null,
        action: "update",
        note: `Employee profile updated. Skipped columns: ${droppedColumns.join(", ") || "none"}`,
      });

      res.json({
        ...updated,
        id_card_front_url: updated.id_card_front_key ? getPublicUrl(String(updated.id_card_front_key)) : null,
        id_card_back_url: updated.id_card_back_key ? getPublicUrl(String(updated.id_card_back_key)) : null,
        profile_photo_url: updated.profile_photo_key ? getPublicUrl(String(updated.profile_photo_key)) : null,
        ...(droppedColumns.length > 0 ? { _dropped_columns: droppedColumns } : {}),
        ...(droppedColumns.length > 0
          ? { _warning: `Some fields were skipped because this database is on an older schema: ${droppedColumns.join(", ")}` }
          : {}),
      });
    } catch (error: unknown) {
      console.error("Failed to update employee:", error);
      res.status(500).json({
        error: "Failed to update employee",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// POST /employees/:id/recover — recover soft-deleted employee
router.post("/:id/recover", requirePermissionSlugs(["hr:write"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("employees")
      .update({ deleted_at: null })
      .eq("id", id);

    if (error) throw error;
    ActivityService.logActivity({
      entity_type: "employee",
      entity_id: id,
      user_id: req.user?.id || null,
      action: "restore",
      note: "Employee profile recovered from trash.",
    });
    NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "hr:read",
      actor_id: req.user?.id,
      title: "Employee Record Recovered",
      message: `Employee record ${id} has been recovered from trash.`,
      entity_type: "employee",
      entity_id: id,
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({
      error: "Failed to recover employee",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// DELETE /employees/:id — Soft delete
router.delete("/:id", requirePermissionSlugs(["hr:write"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error: deleteError } = await supabase
      .from("employees")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (deleteError) throw deleteError;
    ActivityService.logActivity({
      entity_type: "employee",
      entity_id: id,
      user_id: req.user?.id || null,
      action: "delete",
      note: "Employee profile soft deleted.",
    });
    NotificationsService.emitNotificationToRoleOrPermission({
      permissionSlug: "hr:read",
      actor_id: req.user?.id,
      title: "Employee Record Deleted",
      message: `Employee record ${id} has been soft deleted.`,
      entity_type: "employee",
      entity_id: id,
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({
      error: "Failed to delete employee",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// DELETE /employees/:id/permanent — Hard delete
router.delete("/:id/permanent", requirePermissionSlugs(["hr:write"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error: deleteError } = await supabase
      .from("employees")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;
    ActivityService.logActivity({
      entity_type: "employee",
      entity_id: id,
      user_id: req.user?.id || null,
      action: "permanent_delete",
      note: "Employee profile permanently deleted.",
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({
      error: "Failed to permanently delete employee",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
