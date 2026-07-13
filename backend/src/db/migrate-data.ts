import { Client } from "pg";

const sourceUrl = "postgresql://postgres.vongnaatrmyjpmuqaonp:N4kdDfB8h05MZWaG@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const destUrl = "postgresql://postgres.jrwwcqouelqfzuqjhfjp:26q7Ldjg5WHl8ccj@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";

async function copyData() {
  const source = new Client({ 
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false }
  });
  const dest = new Client({ 
    connectionString: destUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting to source database...");
    await source.connect();
    console.log("Connecting to destination database...");
    await dest.connect();

    // Fetch list of tables from public schema in source
    const tableRes = await source.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tables = tableRes.rows.map(r => r.table_name);
    console.log(`Found ${tables.length} tables to copy.`);

    // First truncate all tables (ignoring order/cascade issues)
    console.log("Truncating all destination tables...");
    for (const table of tables) {
      try {
        await dest.query(`TRUNCATE TABLE "public"."${table}" CASCADE`);
      } catch {
        // ignore truncate ordering/cascade issues; retried across passes
      }
    }

    const deferredColumns: Record<string, string[]> = {
      events: ["event_proposal_id"],
      event_proposals: ["converted_event_id"]
    };

    // Run 5 passes to resolve foreign keys dynamically
    const maxPasses = 5;
    const completedTables = new Set<string>();

    for (let pass = 1; pass <= maxPasses; pass++) {
      console.log(`\n🔄 Pass ${pass}/${maxPasses}...`);
      let progressThisPass = 0;

      for (const table of tables) {
        if (completedTables.has(table)) continue;

        try {
          // Get non-generated columns for this table in source
          const srcColRes = await source.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = $1 
              AND is_generated = 'NEVER'
          `, [table]);
          const srcCols = srcColRes.rows.map(r => r.column_name);

          // Get non-generated columns for this table in dest
          const destColRes = await dest.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = $1 
              AND is_generated = 'NEVER'
          `, [table]);
          const destCols = destColRes.rows.map(r => r.column_name);

          // Find intersecting columns, skipping deferred ones
          const skipCols = deferredColumns[table] || [];
          const cols = srcCols.filter(c => destCols.includes(c) && !skipCols.includes(c));

          if (cols.length === 0) {
            console.log(`Table ${table} has no overlapping columns. Skipping.`);
            completedTables.add(table);
            continue;
          }

          const colNames = cols.map(c => `"${c}"`).join(", ");

          // Fetch all rows from source (only select overlapping columns)
          const rowsRes = await source.query(`SELECT ${colNames} FROM "public"."${table}"`);
          const rows = rowsRes.rows;

          if (rows.length === 0) {
            console.log(`Table ${table} is empty. Skipping.`);
            completedTables.add(table);
            continue;
          }

          // Try to insert rows
          await dest.query("BEGIN;");
          for (const row of rows) {
            const values = cols.map(c => {
              const val = row[c];
              if (val !== null && typeof val === "object") {
                return JSON.stringify(val);
              }
              return val;
            });
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
            await dest.query(`INSERT INTO "public"."${table}" (${colNames}) VALUES (${placeholders})`, values);
          }
          await dest.query("COMMIT;");
          
          console.log(`✅ Successfully copied ${rows.length} rows for table: ${table}.`);
          completedTables.add(table);
          progressThisPass++;

        } catch (tableError) {
          try {
            await dest.query("ROLLBACK;");
          } catch {
            // no active transaction to roll back
          }
          // Log only on final pass to keep output clean
          if (pass === maxPasses) {
            console.warn(`❌ Final pass failed for table "${table}":`, (tableError as Error)?.message || tableError);
          }
        }
      }

      console.log(`Pass ${pass} completed. Newly copied tables: ${progressThisPass}`);
      if (progressThisPass === 0 && completedTables.size < tables.length) {
        console.log("No new progress made this pass, but continuing to resolve dependencies...");
      }
    }

    // Run post-copy resolution for deferred circular columns
    console.log("\nResolving deferred circular dependencies...");
    
    // Update events.event_proposal_id
    try {
      const eventsSrc = await source.query(`SELECT id, event_proposal_id FROM "public"."events" WHERE event_proposal_id IS NOT NULL`);
      if (eventsSrc.rows.length > 0) {
        console.log(`Updating events.event_proposal_id for ${eventsSrc.rows.length} rows...`);
        for (const row of eventsSrc.rows) {
          await dest.query(`UPDATE "public"."events" SET event_proposal_id = $1 WHERE id = $2`, [row.event_proposal_id, row.id]);
        }
        console.log("✅ events.event_proposal_id resolved.");
      }
    } catch (err) {
      console.warn("⚠️ Failed to resolve events.event_proposal_id:", (err as Error)?.message || err);
    }

    // Update event_proposals.converted_event_id
    try {
      const proposalsSrc = await source.query(`SELECT id, converted_event_id FROM "public"."event_proposals" WHERE converted_event_id IS NOT NULL`);
      if (proposalsSrc.rows.length > 0) {
        console.log(`Updating event_proposals.converted_event_id for ${proposalsSrc.rows.length} rows...`);
        for (const row of proposalsSrc.rows) {
          await dest.query(`UPDATE "public"."event_proposals" SET converted_event_id = $1 WHERE id = $2`, [row.converted_event_id, row.id]);
        }
        console.log("✅ event_proposals.converted_event_id resolved.");
      }
    } catch (err) {
      console.warn("⚠️ Failed to resolve event_proposals.converted_event_id:", (err as Error)?.message || err);
    }

    console.log(`\n🎉 Data copy finished! Copied ${completedTables.size}/${tables.length} tables.`);

  } catch (error) {
    console.error("❌ Data copy failed:", error);
  } finally {
    await source.end();
    await dest.end();
  }
}

copyData();
