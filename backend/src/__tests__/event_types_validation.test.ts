import { describe, expect, test } from "bun:test";
import { createEventTypeSchema } from "../lib/validation";

describe("Event type metadata validation", () => {
  test("accepts valid event metadata", () => {
    const result = createEventTypeSchema.safeParse({
      event_name: "Wedding",
      description: "Standard wedding package",
    });

    expect(result.success).toBe(true);
  });

  test("rejects missing event name", () => {
    const result = createEventTypeSchema.safeParse({
      description: "Should fail",
    });

    expect(result.success).toBe(false);
  });

  test("allows empty description", () => {
    const result = createEventTypeSchema.safeParse({
      event_name: "Mels",
    });

    expect(result.success).toBe(true);
  });
});
