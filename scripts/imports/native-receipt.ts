import { stripVTControlCharacters } from "node:util";

// One summary per isolated native process, in script order: formula imports,
// finance audit acknowledgement, then event editing.
const EXPECTED_PASS_SUMMARIES = [12, 28, 6];

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
