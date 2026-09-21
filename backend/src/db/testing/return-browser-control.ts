import { Client } from "pg";
import { attestDreamluxNativeTarget } from "./dreamlux-native-target";

const itemId = "27300000-0000-4000-8000-000000000010";
const eventId = "27300000-0000-4000-8000-000000000011";
const otherEventId = "27300000-0000-4000-8000-000000000012";
const allocationId = "27300000-0000-4000-8000-000000000013";
const receiptId = "27300000-0000-4000-8000-000000000014";
const actorId = "25900000-0000-4000-8000-000000000001";

async function main() {
  const action = process.argv[2];
  if (action !== "reset" && action !== "state") throw new Error("Unknown synthetic return control action");
  attestDreamluxNativeTarget(process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL ?? "", "admin");
  const target = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(target.pathname)) {
    throw new Error("Refusing a database outside the independently owned equipment fixture");
  }
  const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const identity = await client.query<{ database: string; actor: string; port: number }>(
      "select current_database() as database,current_user as actor,inet_server_port() as port",
    );
    if (identity.rows[0]?.database !== target.pathname.slice(1)
      || identity.rows[0].actor !== "dreamlux_parity" || identity.rows[0].port !== 55434) {
      throw new Error("Synthetic return target identity changed");
    }
    if (action === "reset") {
      await client.query("begin");
      try {
        await client.query("truncate items,events,activity_logs cascade");
        await client.query("insert into items(id,name,quantity) values($1,'Synthetic returned display',10)", [itemId]);
        await client.query(`insert into events(id,name,client_name,start_date,end_date,venue_location,created_by)
          values($1,'Synthetic returned event','Synthetic customer','2030-01-15','2030-01-15','Synthetic venue',$3),
            ($2,'Synthetic future event','Synthetic customer','2035-01-15','2035-01-15','Synthetic venue',$3)`, [eventId, otherEventId, actorId]);
        await client.query(`insert into event_allocations
          (id,event_id,item_id,quantity_allocated,status,departed_at,departed_by,returned_good_quantity,returned_at,returned_by,created_by)
          values($1,$2,$3,10,'Returned',now(),$4,10,now(),$4,$4)`, [allocationId, eventId, itemId, actorId]);
        await client.query(`insert into event_return_receipts
          (id,allocation_id,event_id,item_id,good_quantity,outstanding_before,outstanding_after,created_by,notes)
          values($1,$2,$3,$4,10,10,0,$5,'Original synthetic receipt')`, [receiptId, allocationId, eventId, itemId, actorId]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    const state = await client.query(`select
      i.quantity::int as owned,a.returned_good_quantity as good,a.returned_lost_quantity as lost,a.status,
      (a.quantity_allocated-a.returned_good_quantity-a.returned_damaged_quantity-a.returned_lost_quantity-a.returned_repair_quantity)::int as outstanding,
      (i.quantity-i.unavailable_damaged_quantity-i.unavailable_repair_quantity-coalesce((
        select sum(quantity_allocated-returned_good_quantity-returned_damaged_quantity-returned_lost_quantity-returned_repair_quantity)
        from event_allocations where item_id=i.id and status<>'Returned'),0))::int as available,
      (select good_quantity from event_return_receipts where id=$3) as original_good,
      (select count(*)::int from event_return_receipts where item_id=$1) as receipts,
      (select count(*)::int from event_return_corrections where item_id=$1) as corrections,
      (select count(*)::int from inventory_movements where item_id=$1) as movements,
      (select count(*)::int from event_logs where event_id=a.event_id and field_changed='inventory_return_correction') as audits
      from items i join event_allocations a on a.item_id=i.id where i.id=$1 and a.id=$2`, [itemId, allocationId, receiptId]);
    console.log(JSON.stringify(state.rows[0]));
  } finally {
    await client.end();
  }
}

void main().catch(() => {
  console.error("Synthetic return SQL control failed");
  process.exitCode = 1;
});
