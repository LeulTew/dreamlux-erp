import { describe, expect, it } from "vitest";
import { isFinanceOutcomeUncertain } from "./finance-mutation";

describe("isFinanceOutcomeUncertain", () => {
  it.each([
    ["an explicit uncertain commit", { response: { status: 503, data: { outcome_uncertain: true } } }],
    ["a lost gateway reply", { response: { status: 504, data: {} } }],
    ["a bad gateway even with a certainty marker", { response: { status: 502, data: { outcome_uncertain: false } } }],
    ["a server failure without a certainty marker", { response: { status: 500, data: { error: "Boom" } } }],
    ["a network failure with no response", { message: "Network Error" }],
    ["a non-object rejection", "timeout"],
  ])("treats %s as uncertain", (_label, error) => {
    expect(isFinanceOutcomeUncertain(error)).toBe(true);
  });

  it.each([
    ["a known rolled-back server failure", { response: { status: 500, data: { error: "Finance audit write was not acknowledged", outcome_uncertain: false } } }],
    ["a conflict", { response: { status: 409, data: { error: "Month 2026-05 is closed for edits" } } }],
    ["a validation failure", { response: { status: 400, data: { error: "Amount must be greater than zero" } } }],
    ["a missing record", { response: { status: 404, data: { error: "Operational expense not found" } } }],
  ])("treats %s as a known failure", (_label, error) => {
    expect(isFinanceOutcomeUncertain(error)).toBe(false);
  });

  it.each(["false", 0, null])("never coerces a non-boolean certainty marker %j into a known failure", (outcome_uncertain) => {
    expect(isFinanceOutcomeUncertain({ response: { status: 500, data: { outcome_uncertain } } })).toBe(true);
  });
});
