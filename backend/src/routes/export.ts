import { Router, Response } from "express";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import sharp from "sharp";
import { supabase } from "../db/supabase";

import { getPublicUrl, downloadImage } from "../storage/storage";
import { AuthRequest, requireRole } from "../middleware/auth";

interface ItemRow {
  id: string;
  name: string;
  quantity: number;
  description: string | null;
  store_id: string;
  store_name: string | null;
  image_key: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseItemRow {
  id: string;
  name: string;
  quantity: number;
  description: string | null;
  store_id: string;
  image_key: string | null;
  created_at: string;
  updated_at: string;
  stores: { name: string } | null;
}

const router = Router();

type EmbeddedImage = {
  buffer: Buffer;
  extension: "jpeg" | "png";
};

async function normalizeImageForEmbedding(
  sourceBuffer: Buffer
): Promise<EmbeddedImage | null> {
  try {
    // Ultra-aggressive compression to stay under Vercel's 4.5MB payload limit
    // 80px is enough for a small card thumbnail
    const converted = await sharp(sourceBuffer)
      .resize({ height: 80, withoutEnlargement: true })
      .jpeg({ quality: 30, mozjpeg: true })
      .toBuffer();
    return { buffer: converted, extension: "jpeg" };
  } catch {
    return null;
  }
}

// Helper: fetch items with optional store filter
async function fetchItemsForExport(storeFilter?: string): Promise<ItemRow[]> {
  let query = supabase.from("items").select(`*, stores(name)`).neq("quantity", -999999);

  if (storeFilter && storeFilter !== "all") {
    query = query.eq("store_id", storeFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = (data as unknown as SupabaseItemRow[]).map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    description: item.description,
    store_id: item.store_id,
    store_name: item.stores?.name ?? null,
    image_key: item.image_key,
    created_at: item.created_at,
    updated_at: item.updated_at,
  })) as ItemRow[];

  items.sort((a, b) => {
    const sA = a.store_name || "";
    const sB = b.store_name || "";
    if (sA !== sB) return sA.localeCompare(sB);
    return a.name.localeCompare(b.name);
  });

  return items;
}

// GET /export/pdf — DEPRECATED (Moved to client-side in frontend/src/lib/pdf-export.ts)
router.get("/pdf", (req, res) => {
  res.status(410).json({ error: "PDF export has moved to the client-side. Please update your frontend." });
});

// GET /export/xlsx — Excel with embedded images
router.get("/xlsx", requireRole(["OWNER", "OPS_MANAGER", "INVENTORY_OFFICER", "ADMIN", "SUPER_ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeFilter = req.query.store as string | undefined;
    const items = await fetchItemsForExport(storeFilter);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Assets", {
      pageSetup: { orientation: "landscape" },
    });

    // Header styling
    const headerFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    const headerFont: Partial<ExcelJS.Font> = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 12,
    };

    // Define columns
    sheet.columns = [
      { header: "Image", key: "image", width: 14 },
      { header: "Asset Name", key: "name", width: 30 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "Office / Store", key: "store", width: 20 },
      { header: "Description", key: "description", width: 40 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Add data rows with images
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowIndex = i + 2;
      const row = sheet.addRow({
        name: item.name,
        quantity: item.quantity,
        store: item.store_name ?? "—",
        description: item.description ?? "—",
      });

      row.height = 55;
      row.alignment = { vertical: "middle" };

      // Alternate row colors
      if (i % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8F9FA" },
          };
        });
      }

      // Embed image
      if (item.image_key) {
        try {
          const imgBuffer = await downloadImage(item.image_key);
          const normalized = await normalizeImageForEmbedding(imgBuffer);
          if (!normalized) {
            continue;
          }

          const imageId = workbook.addImage({
            buffer: normalized.buffer,
            extension: normalized.extension,
          } as unknown as ExcelJS.Image);

          sheet.addImage(imageId, {
            tl: { col: 0.15, row: rowIndex - 0.85 },
            ext: { width: 50, height: 50 },
          });
        } catch {
          // Skip image if download fails — leave cell blank
        }
      }
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="assets-report.xlsx"'
    );

    await workbook.xlsx.write(res as unknown as import("stream").Stream);
    res.end();
  } catch (error) {
    console.error("Excel export failed:", error);
    res.status(500).json({ error: "Excel export failed" });
  }
});

// GET /export/csv — CSV with image URLs
router.get("/csv", requireRole(["OWNER", "OPS_MANAGER", "INVENTORY_OFFICER", "ADMIN", "SUPER_ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeFilter = req.query.store as string | undefined;
    const items = await fetchItemsForExport(storeFilter);

    const csvData = items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      store: item.store_name ?? "",
      description: item.description ?? "",
      image_url: item.image_key ? getPublicUrl(item.image_key) : "",
    }));

    const csv = stringify(csvData, {
      header: true,
      columns: [
        { key: "name", header: "Asset Name" },
        { key: "quantity", header: "Quantity" },
        { key: "store", header: "Office / Store" },
        { key: "description", header: "Description" },
        { key: "image_url", header: "Image URL" },
      ],
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="assets-report.csv"'
    );
    res.send(csv);
  } catch (error) {
    console.error("CSV export failed:", error);
    res.status(500).json({ error: "CSV export failed" });
  }
});



// ====================================================
// HR EXPORTS (EMPLOYEES)
// ====================================================

async function fetchEmployeesForExport(officeFilter?: string) {
  let query = supabase
    .from("employees")
    .select("*, stores(name)")
    .neq("status", "trash");

  if (officeFilter && officeFilter !== "all") {
    query = query.eq("office_id", officeFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  
  return data || [];
}

async function fetchEventTypesForExport() {
  const { data, error } = await supabase
    .from("event_types")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []) as Array<{ id: string; name: string }>;
}

function parseEventPricesForExport(raw: unknown): Record<string, number> {
  if (!raw) return {};

  let source: Record<string, unknown> = {};
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      source = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else if (typeof raw === "object") {
    source = raw as Record<string, unknown>;
  }

  return Object.fromEntries(
    Object.entries(source).map(([eventId, value]) => {
      const normalized = Number(value);
      return [eventId, Number.isFinite(normalized) ? normalized : 0];
    })
  );
}

function toEventColumnKey(eventId: string): string {
  return `event_${eventId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function buildEventColumnMeta(
  employees: Array<Record<string, unknown>>,
  eventTypes: Array<{ id: string; name: string }>
) {
  const eventNameById = new Map(eventTypes.map((eventType) => [eventType.id, eventType.name]));
  const eventIds = new Set<string>();

  for (const employee of employees) {
    const eventPrices = parseEventPricesForExport(employee.event_prices);
    for (const eventId of Object.keys(eventPrices)) {
      eventIds.add(eventId);
    }
  }

  return [...eventIds]
    .sort((a, b) => {
      const nameA = eventNameById.get(a) || a;
      const nameB = eventNameById.get(b) || b;
      return nameA.localeCompare(nameB);
    })
    .map((eventId) => ({
      eventId,
      key: toEventColumnKey(eventId),
      header: `Event: ${eventNameById.get(eventId) || eventId} (ETB)`,
    }));
}

function buildEmployeeExportRow(
  employee: Record<string, unknown>,
  eventColumns: Array<{ eventId: string; key: string }>
) {
  const eventPrices = parseEventPricesForExport(employee.event_prices);
  const row: Record<string, string> = {
    employee_id: String(employee.employee_id ?? ""),
    full_name: String(employee.full_name ?? ""),
    office: String((employee.stores as { name?: string } | undefined)?.name ?? "Main Branch"),
    department: String(employee.department ?? ""),
    phone: String(employee.phone ?? ""),
    email: String(employee.email ?? ""),
    salary_level: String(employee.salary_level ?? ""),
    commission: employee.commission == null ? "" : String(employee.commission),
    event_prices_json: JSON.stringify(eventPrices),
    created_at: String(employee.created_at ?? ""),
    updated_at: String(employee.updated_at ?? ""),
  };

  for (const column of eventColumns) {
    row[column.key] = eventPrices[column.eventId] == null ? "" : String(eventPrices[column.eventId]);
  }

  return row;
}

router.get("/employees/csv", requireRole(["OWNER", "HR_MANAGER", "ADMIN", "SUPER_ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const officeFilter = req.query.office as string | undefined;
    const [employees, eventTypes] = await Promise.all([
      fetchEmployeesForExport(officeFilter),
      fetchEventTypesForExport(),
    ]);
    const eventColumns = buildEventColumnMeta(employees as Array<Record<string, unknown>>, eventTypes);

    // DO NOT include images in CSV (per requirements)
    const csvData = (employees as Array<Record<string, unknown>>).map((emp) =>
      buildEmployeeExportRow(emp, eventColumns)
    );

    const csv = stringify(csvData, {
      header: true,
      columns: [
        { key: "employee_id", header: "ID" },
        { key: "full_name", header: "Full Name" },
        { key: "office", header: "Office" },
        { key: "department", header: "Department" },
        { key: "phone", header: "Phone" },
        { key: "email", header: "Email" },
        { key: "salary_level", header: "Salary Level" },
        { key: "commission", header: "Commission" },
        ...eventColumns.map((column) => ({ key: column.key, header: column.header })),
        { key: "event_prices_json", header: "Event Prices (JSON)" },
        { key: "created_at", header: "Created At" },
        { key: "updated_at", header: "Updated At" },
      ],
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="employees-report.csv"');
    res.send(csv);
  } catch (error) {
    console.error("Employee CSV export failed:", error);
    res.status(500).json({ error: "Employee CSV export failed" });
  }
});

router.get("/employees/xlsx", requireRole(["OWNER", "HR_MANAGER", "ADMIN", "SUPER_ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const officeFilter = req.query.office as string | undefined;
    const [employees, eventTypes] = await Promise.all([
      fetchEmployeesForExport(officeFilter),
      fetchEventTypesForExport(),
    ]);
    const eventColumns = buildEventColumnMeta(employees as Array<Record<string, unknown>>, eventTypes);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Employees");

    // DO NOT include images in Excel (per requirements)
    sheet.columns = [
      { header: "ID", key: "employee_id", width: 15 },
      { header: "Full Name", key: "full_name", width: 30 },
      { header: "Office", key: "office", width: 25 },
      { header: "Department", key: "department", width: 25 },
      { header: "Phone", key: "phone", width: 20 },
      { header: "Email", key: "email", width: 30 },
      { header: "Salary Level", key: "salary_level", width: 16 },
      { header: "Commission", key: "commission", width: 14 },
      ...eventColumns.map((column) => ({ header: column.header, key: column.key, width: 18 })),
      { header: "Event Prices (JSON)", key: "event_prices_json", width: 40 },
      { header: "Created At", key: "created_at", width: 24 },
      { header: "Updated At", key: "updated_at", width: 24 },
    ];

    const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
    });

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i] as unknown as Record<string, unknown>;
      const row = sheet.addRow(buildEmployeeExportRow(emp, eventColumns));
        
        if (i % 2 === 1) {
            row.eachCell((cell) => {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FA" } };
            });
        }
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="employees-report.xlsx"');
    await workbook.xlsx.write(res as unknown as import("stream").Stream);
    res.end();
  } catch (error) {
    console.error("Employee Excel export failed:", error);
    res.status(500).json({ error: "Employee Excel export failed" });
  }
});


// ====================================================
// HR EXPORTS (PAYROLL RUN)
// ====================================================

router.get("/payroll/:id/csv", requireRole(["OWNER", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const { data: runResult, error: runError } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (runError) throw runError;
    if (!runResult) { res.status(404).json({ error: "Run not found" }); return; }
    
    const run = runResult;

    const periodTag = run.period_start
      ? new Date(run.period_start).toISOString().slice(0, 7)
      : run.id;

    const { data: linesResult, error: linesError } = await supabase
      .from("payroll_run_employee_lines")
      .select("*")
      .eq("run_id", id);
      
    if (linesError) throw linesError;
    
    // Sort lines by employee_name_snapshot
    const lines = (linesResult ?? []).sort((a: any, b: any) => a.employee_name_snapshot.localeCompare(b.employee_name_snapshot));

    const totals = lines.reduce(
      (acc: { base: number; events: number; total: number }, line: any) => {
        acc.base += Number(line.base_salary_snapshot ?? 0);
        acc.events += Number(line.commission_total_snapshot ?? 0);
        acc.total += Number(line.employee_total_snapshot ?? 0);
        return acc;
      },
      { base: 0, events: 0, total: 0 }
    );

    const csvData = lines.map((line: any) => ({
      employee_name: line.employee_name_snapshot,
      base_salary: Number(line.base_salary_snapshot).toFixed(2),
      events_total: Number(line.commission_total_snapshot).toFixed(2),
      total_pay: Number(line.employee_total_snapshot).toFixed(2)
    }));

    csvData.push({
      employee_name: "TOTAL",
      base_salary: totals.base.toFixed(2),
      events_total: totals.events.toFixed(2),
      total_pay: totals.total.toFixed(2),
    });

    const csv = stringify(csvData, {
      header: true,
      columns: [
        { key: "employee_name", header: "Employee" },
        { key: "base_salary", header: "Base Salary" },
        { key: "events_total", header: "Events Total" },
        { key: "total_pay", header: "Total Paid" }
      ]
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-run-${periodTag}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Payroll CSV export failed:", error);
    res.status(500).json({ error: "Payroll CSV export failed" });
  }
});

router.get("/payroll/:id/xlsx", requireRole(["OWNER", "ACCOUNTANT", "ADMIN", "SUPER_ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const { data: runResult, error: runError } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (runError) throw runError;
    if (!runResult) { res.status(404).json({ error: "Run not found" }); return; }
    
    const run = runResult;

    const periodTag = run.period_start
      ? new Date(run.period_start).toISOString().slice(0, 7)
      : run.id;

    const { data: linesResult, error: linesError } = await supabase
      .from("payroll_run_employee_lines")
      .select("*")
      .eq("run_id", id);
      
    if (linesError) throw linesError;
    
    const lines = (linesResult ?? []).sort((a: any, b: any) => a.employee_name_snapshot.localeCompare(b.employee_name_snapshot));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Payroll ${periodTag}`);

    sheet.columns = [
      { header: "Employee", key: "employee_name", width: 35 },
      { header: "Base Salary", key: "base_salary", width: 20 },
      { header: "Events Total", key: "events_total", width: 20 },
      { header: "Total Paid", key: "total_pay", width: 20 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });

    const totals = { base: 0, events: 0, total: 0 };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const baseSalary = Number(line.base_salary_snapshot ?? 0);
        const eventsTotal = Number(line.commission_total_snapshot ?? 0);
        const totalPay = Number(line.employee_total_snapshot ?? 0);

        totals.base += baseSalary;
        totals.events += eventsTotal;
        totals.total += totalPay;

        const row = sheet.addRow({
          employee_name: line.employee_name_snapshot,
          base_salary: baseSalary.toFixed(2),
          events_total: eventsTotal.toFixed(2),
          total_pay: totalPay.toFixed(2)
        });
        
        if (i % 2 === 1) {
            row.eachCell((cell) => {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FA" } };
            });
        }
    }

    const totalRow = sheet.addRow({
      employee_name: "TOTAL",
      base_salary: totals.base.toFixed(2),
      events_total: totals.events.toFixed(2),
      total_pay: totals.total.toFixed(2),
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-run-${periodTag}.xlsx"`);
    await workbook.xlsx.write(res as unknown as import("stream").Stream);
    res.end();
  } catch (error) {
    console.error("Payroll Excel export failed:", error);
    res.status(500).json({ error: "Payroll Excel export failed" });
  }
});


export default router;
