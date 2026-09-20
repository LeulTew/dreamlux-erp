import { stripVTControlCharacters } from "node:util";

export function assertImportNativeReceipt(output: string) {
  const plain = stripVTControlCharacters(output);
  if (!/^\s*12 pass\s*$/m.test(plain) || /^\s*[1-9]\d* (?:skip|fail|errors?)\s*$/m.test(plain)) {
    throw new Error("Native import verification produced an incomplete receipt");
  }
}
