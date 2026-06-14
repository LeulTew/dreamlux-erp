import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const renames: Record<string, string> = {
  "Main Warehouse": "bulbula coka",
  "Store A": "Bulbula 2",
  "Store B": "haya arat (24)",
};

async function renameStores() {
  for (const [oldName, newName] of Object.entries(renames)) {
    const { data, error } = await supabase
      .from("stores")
      .update({ name: newName })
      .eq("name", oldName)
      .select();

    if (error) {
      console.error(`❌ Failed to rename "${oldName}" → "${newName}":`, error.message);
    } else if (data && data.length > 0) {
      console.log(`✅ "${oldName}" → "${newName}"`);
    } else {
      console.log(`⚠️  "${oldName}" not found — may already be renamed`);
    }
  }
}

renameStores();
