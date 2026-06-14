import { Client } from 'pg';

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      employee_id_prefix TEXT NOT NULL DEFAULT 'EMP',
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    INSERT INTO app_settings (id, employee_id_prefix) VALUES (1, 'EMP')
    ON CONFLICT DO NOTHING;
  `);

  console.log('Successfully created app_settings and seeded!');
  await client.end();
}

run().catch(console.error);
