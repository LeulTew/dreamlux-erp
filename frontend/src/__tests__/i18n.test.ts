import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function extractTranslations(filePath: string): { en: Record<string, string>; am: Record<string, string> } {
  const absolutePath = path.resolve(__dirname, "..", filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File does not exist: ${absolutePath}`);
  }
  const fileContent = fs.readFileSync(absolutePath, "utf-8");
  const translationsMatch =
    fileContent.match(/const TRANSLATIONS: Record<string, Record<string, string\s*\|\s*string\[\]>> = ([\s\S]*?);/) ||
    fileContent.match(/const TRANSLATIONS: Record<string, Record<string, string>> = ([\s\S]*?);/);
  if (!translationsMatch) {
    throw new Error(`Could not find TRANSLATIONS map in ${filePath}`);
  }

  // Evaluate the extracted object string safely
  const evalFunc = new Function(`return ${translationsMatch[1]}`);
  return evalFunc();
}

describe("Translation Symmetries & i18n Completeness", () => {
  const targets = [
    "app/events/[id]/page.tsx",
    "app/events/page.tsx",
    "app/events/proposals/page.tsx",
    "app/events/proposals/new/page.tsx",
    "app/events/proposals/[id]/page.tsx",
    "app/hr/expenses/approve/page.tsx",
    "app/hr/reports/profit/page.tsx",
    "app/settings/security/page.tsx",
    "components/app-sidebar.tsx",
  ];

  targets.forEach((target) => {
    it(`should have matching English and Amharic translation keys in ${target}`, () => {
      const { en, am } = extractTranslations(target);

      expect(en).toBeDefined();
      expect(am).toBeDefined();

      const enKeys = Object.keys(en).sort();
      const amKeys = Object.keys(am).sort();

      // Check that both have exactly the same keys
      expect(enKeys).toEqual(amKeys);

      // Verify that no translation values are empty strings or placeholders
      enKeys.forEach((key) => {
        expect(en[key]).toBeTruthy();
        expect(am[key]).toBeTruthy();
      });
    });
  });
});
