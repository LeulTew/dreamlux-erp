const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://postgres.vongnaatrmyjpmuqaonp:N4kdDfB8h05MZWaG@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
  });
  await client.connect();
  
  try {
    const res = await client.query('SELECT count(*) FROM public.notifications;');
    console.log("Total notifications:", res.rows[0].count);

    const users = await client.query('SELECT id, username, role FROM public.users;');
    console.log("Users:", users.rows);

    const recent = await client.query('SELECT * FROM public.notifications ORDER BY created_at DESC LIMIT 5;');
    console.log("Recent notifications:", recent.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

check();
