import { stripVTControlCharacters } from "node:util";

// One summary per isolated native process, in script order: formula imports,
// then finance audit acknowledgement.
const EXPECTED_PASS_SUMMARIES = [12, 19];

export function assertImportNativeReceipt(output: string) {
  const plain = stripVTControlCharacters(output);
  const passes = [...plain.matchAll(/^\s*(\d+) pass\s*$/gm)].map((match) => Number(match[1]));
  if (
    passes.join(",") !== EXPECTED_PASS_SUMMARIES.join(",")
    || /^\s*[1-9]\d* (?:skip|fail|errors?)\s*$/m.test(plain)
  ) {
    throw new Error("Native import verification produced an incomplete receipt");
  }
}
