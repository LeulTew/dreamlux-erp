import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { Client } from "pg";
import { getEnv } from "../lib/env";
import { createMigrationClient } from "./migration-client";

type FixtureIds = {
  employeeId: string;
  driverId: string;
  vehicleId: string;
  firstEventId: string;
  secondEventId: string;
};

function isOverlapError(error: unknown): boolean {
  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === "23P01" || /overlapping event|already assigned|already booked/i.test(maybeError.message ?? "");
}

async function applyAssignmentIntegrityMigration(client: Client) {
  const migrationPath = path.join(__dirname, "migrations", "assignment_integrity.sql");
  await client.query(fs.readFileSync(migrationPath, "utf-8"));
}

async function createFixtures(client: Client): Promise<FixtureIds> {
  const suffix = randomUUID().slice(0, 8);

  const employee = await client.query<{ id: string }>(
    `INSERT INTO employees (full_name, employee_id, contract_status)
     VALUES ($1, $2, 'Active')
     RETURNING id`,
    [`Issue 31 Concurrent Employee ${suffix}`, `I31-EMP-${suffix}`],
  );
  const driver = await client.query<{ id: string }>(
    `INSERT INTO employees (full_name, employee_id, contract_status)
     VALUES ($1, $2, 'Active')
     RETURNING id`,
    [`Issue 31 Concurrent Driver ${suffix}`, `I31-DRV-${suffix}`],
  );
  const vehicle = await client.query<{ id: string }>(
    `INSERT INTO vehicles (plate_number, vehicle_type, fuel_type, fuel_consumption_rate)
     VALUES ($1, 'Van', 'Diesel', 1)
     RETURNING id`,
    [`I31-${suffix}`],
  );
  const firstEvent = await client.query<{ id: string }>(
    `INSERT INTO events (name, client_name, start_date, end_date, venue_location, contract_price)
     VALUES ($1, 'Issue 31 Client', '2031-01-10', '2031-01-12', 'Issue 31 Venue', 1000)
     RETURNING id`,
    [`Issue 31 Concurrent Event A ${suffix}`],
  );
  const secondEvent = await client.query<{ id: string }>(
    `INSERT INTO events (name, client_name, start_date, end_date, venue_location, contract_price)
     VALUES ($1, 'Issue 31 Client', '2031-01-11', '2031-01-13', 'Issue 31 Venue', 1000)
     RETURNING id`,
    [`Issue 31 Concurrent Event B ${suffix}`],
  );

  return {
    employeeId: employee.rows[0].id,
    driverId: driver.rows[0].id,
    vehicleId: vehicle.rows[0].id,
    firstEventId: firstEvent.rows[0].id,
    secondEventId: secondEvent.rows[0].id,
  };
}

async function cleanupFixtures(client: Client, fixture: FixtureIds | null) {
  if (!fixture) return;

  await client.query("DELETE FROM vehicle_assignments WHERE event_id = ANY($1::uuid[])", [
    [fixture.firstEventId, fixture.secondEventId],
  ]);
  await client.query("DELETE FROM event_assignments WHERE event_id = ANY($1::uuid[])", [
    [fixture.firstEventId, fixture.secondEventId],
  ]);
  await client.query("DELETE FROM events WHERE id = ANY($1::uuid[])", [[fixture.firstEventId, fixture.secondEventId]]);
  await client.query("DELETE FROM vehicles WHERE id = $1", [fixture.vehicleId]);
  await client.query("DELETE FROM employees WHERE id = ANY($1::uuid[])", [[fixture.employeeId, fixture.driverId]]);
}

async function runConcurrentInserts(
  databaseUrl: string,
  firstSql: string,
  secondSql: string,
  firstParams: unknown[],
  secondParams: unknown[],
) {
  const first = createMigrationClient(databaseUrl);
  const second = createMigrationClient(databaseUrl);
  await first.connect();
  await second.connect();

  try {
    const results = await Promise.allSettled([first.query(firstSql, firstParams), second.query(secondSql, secondParams)]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const overlapFailures = results.filter((result) => result.status === "rejected" && isOverlapError(result.reason));

    if (fulfilled.length !== 1 || overlapFailures.length !== 1) {
      throw new Error(
        `Expected exactly one insert success and one overlap failure, got ${fulfilled.length} success and ${overlapFailures.length} overlap failures`,
      );
    }
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
}

async function main() {
  const databaseUrl = getEnv("DATABASE_BACKUP_URL") || getEnv("DATABASE_URL");

  if (!databaseUrl) {
    console.log("[Issue31] Skipping live assignment concurrency verification: DATABASE_BACKUP_URL or DATABASE_URL is not set.");
    return;
  }

  const setup = createMigrationClient(databaseUrl);
  await setup.connect();
  let fixture: FixtureIds | null = null;

  try {
    await applyAssignmentIntegrityMigration(setup);
    fixture = await createFixtures(setup);

    await runConcurrentInserts(
      databaseUrl,
      `INSERT INTO event_assignments (event_id, employee_id, role) VALUES ($1, $2, 'Lead')`,
      `INSERT INTO event_assignments (event_id, employee_id, role) VALUES ($1, $2, 'Lead')`,
      [fixture.firstEventId, fixture.employeeId],
      [fixture.secondEventId, fixture.employeeId],
    );

    await runConcurrentInserts(
      databaseUrl,
      `INSERT INTO vehicle_assignments (event_id, vehicle_id, driver_id) VALUES ($1, $2, $3)`,
      `INSERT INTO vehicle_assignments (event_id, vehicle_id, driver_id) VALUES ($1, $2, $3)`,
      [fixture.firstEventId, fixture.vehicleId, fixture.driverId],
      [fixture.secondEventId, fixture.vehicleId, fixture.driverId],
    );

    console.log("[Issue31] Live assignment concurrency verification passed.");
  } finally {
    await cleanupFixtures(setup, fixture).catch((error) => {
      console.error("[Issue31] Failed to clean up live concurrency verification fixtures:", error);
    });
    await setup.end();
  }
}

main().catch((error) => {
  console.error("[Issue31] Live assignment concurrency verification failed:", error);
  process.exit(1);
});
