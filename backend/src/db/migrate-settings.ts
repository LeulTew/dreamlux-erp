import { Client } from 'pg';

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      employee_id_prefix TEXT NOT NULL DEFAULT 'EMP',
      inventory_id_prefix TEXT NOT NULL DEFAULT 'INV',
      event_id_prefix TEXT NOT NULL DEFAULT 'EVT',
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS inventory_id_prefix TEXT NOT NULL DEFAULT 'INV';
  `);

  await client.query(`
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS event_id_prefix TEXT NOT NULL DEFAULT 'EVT';
  `);

  await client.query(`
    INSERT INTO app_settings (id, employee_id_prefix, inventory_id_prefix, event_id_prefix) 
    VALUES (1, 'EMP', 'INV', 'EVT')
    ON CONFLICT (id) DO UPDATE SET
      inventory_id_prefix = EXCLUDED.inventory_id_prefix,
      event_id_prefix = EXCLUDED.event_id_prefix;
  `);

  console.log('Successfully created/migrated app_settings and seeded!');
  await client.end();
}

run().catch(console.error);
