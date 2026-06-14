import { Router, Response } from "express";
import { supabase } from "../db/supabase";
import { AuthRequest } from "../middleware/auth";

const router = Router();

// GET /offices — list all offices
router.get("/", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data: storesData, error: storesError } = await supabase
      .from("stores")
      .select("id, name, is_active")
      .order("name", { ascending: true });

    if (storesError) throw storesError;

    const { data: itemsData, error: itemsError } = await supabase
      .from("items")
      .select("store_id")
      .neq("quantity", -999999);

    if (itemsError) throw itemsError;

    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("office_id")
      .is("deleted_at", null)
      .not("office_id", "is", null);

    if (employeesError) throw employeesError;

    const associatedStoreIds = new Set<string>();
    for (const item of itemsData || []) {
      if (item.store_id) associatedStoreIds.add(item.store_id);
    }
    for (const employee of employeesData || []) {
      if (employee.office_id) associatedStoreIds.add(employee.office_id);
    }

    const stores = (storesData || []).filter((store: any) => associatedStoreIds.has(store.id));

    res.json(stores);
  } catch (err: unknown) {
    console.error("Failed to fetch offices:", err);
    res.status(500).json({
      error: "Failed to fetch offices",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
