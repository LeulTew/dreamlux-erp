import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const seedSql = readFileSync(join(process.cwd(), "src/db/seeds_dreamlux.sql"), "utf8");

describe("DreamLux SRD seed parity", () => {
  test("seeds exact SRD salary and commission anchors", () => {
    expect(seedSql).toContain("('GM-01', 70000.00");
    expect(seedSql).toContain("('OM-01', 35000.00");
    expect(seedSql).toContain("('PL-01', 14500.00");
    expect(seedSql).toContain("('SK-01', 10000.00");
    expect(seedSql).toContain("('GL-01', 7000.00");
    expect(seedSql).toContain("2000 ETB per event");
    expect(seedSql).toContain("Training Bonus");
    expect(seedSql).not.toContain("'Selam Bekele', 'EMP-2026-0002', 'Logistics', 'Driver', '0922334455', 'selam@dreamlux.com', 12000.00");
  });

  test("seeds SRD sample event and inventory table values", () => {
    expect(seedSql).toContain("Hana & Daniel Wedding");
    expect(seedSql).toContain("Hana Mohammed");
    expect(seedSql).toContain("Friendship International Hotel, Addis Ababa");
    expect(seedSql).toContain("85000.00");
    expect(seedSql).toContain("('White Rose', 540");
    expect(seedSql).toContain("('Nude Rose', 118");
    expect(seedSql).toContain("('Purple Rose', 109");
    expect(seedSql).toContain("Golden Ketal");
    expect(seedSql).toContain("Pink Orchid");
  });

  test("seeds all SRD inventory category examples with full item fields", () => {
    const requiredItems = [
      "Peach Runner",
      "Golden Runner",
      "Blue Tuwill",
      "White Cherk",
      "Nuud Cherk",
      "Tiras",
      "Napkins",
      "Chandeliers",
      "Sham New Big",
      "Sham New Small",
      "Vase Lights",
      "Kichin Shama",
      "Golden Chandler",
      "Welcome Boards",
      "Nikah Board",
      "Dancee Flower",
      "Stage",
      "Background Brat",
      "Frames",
      "Sofas",
      "Mirrors",
      "Mize Tables",
      "Mestawet",
      "Ashangulit",
      "Sefed",
      "Compressor",
      "Washing Machine",
      "Glue Gun",
      "Balloon Pump",
      "Cutter",
      "Scissors",
      "Water Containers",
      "Mop",
      "Broom",
      "Steel Boxes",
      "Plastic Boxes",
    ];

    for (const item of requiredItems) {
      expect(seedSql).toContain(item);
    }

    expect(seedSql).toContain("seed.type");
    expect(seedSql).toContain("seed.color");
    expect(seedSql).toContain("seed.unit");
    expect(seedSql).toContain("seed.purchase_date::date");
    expect(seedSql).toContain("seed.purchase_cost");
    expect(seedSql).toContain("seed.condition_status");
  });

  test("seeds SRD expense total and trip scenario idempotently", () => {
    const expenseAmounts = [3200, 18000, 5000, 1500, 2000];
    const total = expenseAmounts.reduce((sum, amount) => sum + amount, 0);

    expect(total).toBe(29700);
    expect(85000 - total).toBe(55300);
    expect(seedSql).toContain("SRD sample: Fuel (3 vehicles x 2 trips)");
    expect(seedSql).toContain("SRD sample: Labor (8 workers)");
    expect(seedSql).toContain("AA-3-C45678");
    expect(seedSql).toContain("WHERE NOT EXISTS");
    expect(seedSql).toContain("AND t.destination = seed.destination");
    expect(seedSql).toContain("AND exp.description = seed.description");
  });
});
