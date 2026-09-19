import { Client } from "pg";
import { attestDreamluxNativeTarget } from "./dreamlux-native-target";

const retainedItemId = "25900000-0000-4000-8000-000000000010";
const unusedItemId = "25900000-0000-4000-8000-000000000012";
const eventId = "25900000-0000-4000-8000-000000000013";
const actorId = "25900000-0000-4000-8000-000000000001";

async function main() {
  const action = process.argv[2];
  if (action !== "reset" && action !== "state") throw new Error("Unknown synthetic equipment control action");
  attestDreamluxNativeTarget(process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL ?? "", "admin");
  const target = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(target.pathname)) {
    throw new Error("Refusing a database outside the independently owned equipment259 fixture");
  }
  const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const identity = await client.query<{ database: string; actor: string; port: number }>(
      "select current_database() as database,current_user as actor,inet_server_port() as port",
    );
    if (identity.rows[0]?.database !== target.pathname.slice(1)
      || identity.rows[0].actor !== "dreamlux_parity" || identity.rows[0].port !== 55434) {
      throw new Error("Synthetic equipment target identity changed");
    }
    if (action === "reset") {
      await client.query("begin");
      try {
        await client.query("truncate items,events,activity_logs cascade");
        await client.query(`insert into items(id,name,quantity,deleted_at,created_at)
          values($1,'Synthetic retained chair',10,now(),'2030-01-15T10:00:00Z'),
            ($2,'Synthetic unused display',4,now(),'2030-01-15T09:00:00Z')`, [retainedItemId, unusedItemId]);
        await client.query(`insert into events(id,name,client_name,start_date,end_date,venue_location,status,created_by)
          values($1,'Synthetic custody event','Synthetic customer','2030-01-15','2030-01-15','Synthetic venue','Planned',$2)`, [eventId, actorId]);
        await client.query(`insert into event_allocations(event_id,item_id,quantity_allocated,status,departed_at,departed_by,created_by)
          values($1,$2,10,'Pulled',now(),$3,$3)`, [eventId, retainedItemId, actorId]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    const state = await client.query(`select
      (select count(*)::int from items where id=$1) as retained,
      (select quantity from items where id=$1) as quantity,
      (select deleted_at is null from items where id=$1) as restored,
      (select count(*)::int from items where id=$2) as unused,
      (select count(*)::int from event_allocations where item_id=$1) as allocations,
      (select coalesce(sum(quantity_allocated-returned_good_quantity-returned_damaged_quantity-returned_lost_quantity-returned_repair_quantity),0)::int
        from event_allocations where item_id=$1 and departed_at is not null) as outstanding,
      (select count(*)::int from activity_logs where entity_type='asset' and entity_id=$2 and action='permanent_delete' and user_id=$3) as deletion_audits`,
    [retainedItemId, unusedItemId, actorId]);
    console.log(JSON.stringify(state.rows[0]));
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error("Synthetic equipment control failed:", error instanceof Error ? error.message : "Unknown fixture error");
  process.exitCode = 1;
});
