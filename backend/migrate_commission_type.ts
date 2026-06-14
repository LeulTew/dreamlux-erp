import { Client } from "pg";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env from backend directory
dotenv.config({ path: resolve(__dirname, ".env") });

const databaseUrl = process.env.DATABASE_URL || "";

if (!databaseUrl) {
  console.error("Error: DATABASE_URL is required in .env");
  process.exit(1);
}

async function migrate() {
  console.log("Adding commission_type column to employees table...");

  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    
    // Check if column exists
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='employees' AND column_name='commission_type';
    `);

    if (checkRes.rowCount === 0) {
      await client.query("ALTER TABLE employees ADD COLUMN commission_type TEXT DEFAULT 'percent';");
      console.log("Column 'commission_type' added successfully!");
    } else {
      console.log("Column 'commission_type' already exists.");
    }

  } catch (e) {
    console.error("Migration error:", e);
  } finally {
    await client.end();
  }

  process.exit(0);
}

migrate();
