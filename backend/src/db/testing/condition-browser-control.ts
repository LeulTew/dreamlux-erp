import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { attestDreamluxNativeTarget } from "./dreamlux-native-target";

const actor = "25900000-0000-4000-8000-000000000001";
const role = "25900000-0000-4000-8000-000000000002";
const item = "27900000-abcd-4000-8000-000000000010";
const peer = "27900000-abcd-4000-8000-000000000011";
const event = "27900000-abcd-4000-8000-000000000012";
const reuse = "27900000-abcd-4000-8000-000000000013";
const overflow = "27900000-abcd-4000-8000-000000000014";
const allocation = "27900000-abcd-4000-8000-000000000015";
const east = "27900000-abcd-4000-8000-000000000016";
const west = "27900000-abcd-4000-8000-000000000017";
const originalGrants = ["assets:read", "assets:write", "assets:delete", "assets:reconcile", "event_allocations:write", "event_allocations:dispatch"];
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function main() {
  const action = process.argv[2];
  if (!["reset", "state", "reader", "reconciler", "revoke", "restore"].includes(action)) throw new Error("Unknown condition QA action");
  attestDreamluxNativeTarget(process.env.DREAMLUX_NATIVE_TEST_ADMIN_URL ?? "", "admin");
  const target = attestDreamluxNativeTarget(process.env.DATABASE_URL ?? "", "fixture");
  if (!/^\/dreamlux_ephemeral_equipment_259_[a-f0-9]{12}$/.test(target.pathname)) throw new Error("Unowned condition fixture");
  const descriptorPath = process.env.DREAMLUX_EQUIPMENT_BROWSER_DESCRIPTOR;
  if (!descriptorPath) throw new Error("Missing private condition fixture descriptor");
  const descriptor: unknown = JSON.parse(await readFile(descriptorPath, "utf8"));
  if (!record(descriptor) || descriptor.database !== target.pathname.slice(1)
    || descriptor.apiOrigin !== "http://127.0.0.1:5326"
    || typeof descriptor.shutdownKey !== "string" || !/^[a-f0-9]{48}$/.test(descriptor.shutdownKey)) throw new Error("Invalid condition fixture descriptor");
  const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const identity = await client.query("select current_database() as database,current_user as actor,inet_server_port() as port");
    if (identity.rows[0]?.database !== target.pathname.slice(1) || identity.rows[0].actor !== "dreamlux_parity"
      || identity.rows[0].port !== 55434) throw new Error("Condition fixture identity changed");
    if (action !== "state") {
      await client.query("begin");
      try {
        if (action === "reset") {
          await client.query("truncate items,events,activity_logs cascade");
          await client.query(`insert into stores(id,name,is_active) values($1,'Synthetic East location',true),($2,'Synthetic West location',true)
            on conflict(id) do update set name=excluded.name,is_active=excluded.is_active`, [east, west]);
          await client.query(`insert into items(id,name,quantity,store_id,unit_of_measurement,unavailable_damaged_quantity,unavailable_repair_quantity)
            values($1,'Synthetic same-name equipment',10,$3,'sets',0,0),($2,'Synthetic same-name equipment',10,$4,'pcs',3,1)`,
          [item, peer, west, east]);
          await client.query(`insert into events(id,name,client_name,start_date,end_date,venue_location,status,created_by)
            select id,'Synthetic condition '||purpose,'Synthetic customer',day,day,'Synthetic venue','Planned',$4
            from (values($1::uuid,'return','2031-01-01'::date),($2::uuid,'reuse','2032-01-01'::date),
              ($3::uuid,'overflow','2033-01-01'::date)) input(id,purpose,day)`, [event, reuse, overflow, actor]);
          await client.query(`insert into event_allocations(id,event_id,item_id,quantity_allocated,status,departed_at,departed_by,created_by)
            values($1,$2,$3,6,'Pulled',now(),$4,$4)`, [allocation, event, item, actor]);
        }
        const allowed = action === "reader" ? ["assets:read"] : action === "reconciler" ? ["assets:reconcile"]
          : action === "revoke" ? [] : originalGrants;
        await client.query("delete from role_permissions where role_id=$1", [role]);
        await client.query(`insert into role_permissions(role_id,permission_id)
          select $1,id from permissions where slug=any($2::text[])`, [role, allowed]);
        await client.query("commit");
      } catch (error) { await client.query("rollback"); throw error; }
      const response = await fetch("http://127.0.0.1:5326/__qa/condition-authority", {
        method: "POST", headers: { "x-dreamlux-fixture-key": descriptor.shutdownKey }, redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (response.status !== 204) throw new Error("Owned authority refresh was not acknowledged");
    }
    const result = await client.query(`select
      (select jsonb_build_object('id',i.id,'owned',i.quantity,'damaged',i.unavailable_damaged_quantity,'repair',i.unavailable_repair_quantity,
        'unit',i.unit_of_measurement,'store',s.name,'metadata',i.condition_status) from items i left join stores s on s.id=i.store_id where i.id=$1) as item,
      (select to_jsonb(i) from items i where i.id=$2) as peer,
      (select coalesce(jsonb_agg(r order by r.created_at,r.id),'[]'::jsonb) from inventory_condition_resolutions r where r.item_id=$1) as resolutions,
      (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from inventory_condition_resolutions r where r.item_id=$2) as peer_resolutions,
      (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from event_return_receipts r where r.item_id=$1) as receipts,
      (select coalesce(jsonb_agg(m order by m.id),'[]'::jsonb) from inventory_movements m where m.item_id=$1) as movements,
      (select coalesce(jsonb_agg(a order by a.id),'[]'::jsonb) from event_allocations a where a.event_id=$3) as reused`,
    [item, peer, reuse]);
    console.log(JSON.stringify(result.rows[0]));
  } finally { await client.end(); }
}

void main().catch((error: unknown) => {
  console.error("Synthetic condition control failed:", error instanceof Error ? error.message : "Unknown fixture error");
  process.exitCode = 1;
});
