import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import ts from "typescript";

type TranslationValue = string | string[];
type Translations = { en: Record<string, TranslationValue>; am: Record<string, TranslationValue> };

function unwrapExpression(node: ts.Expression): ts.Expression {
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    node = node.expression;
  }
  return node;
}

function objectProperties(node: ts.Expression | undefined, location: string): Array<[string, ts.Expression]> {
  const value = node && unwrapExpression(node);
  if (!value || !ts.isObjectLiteralExpression(value)) {
    throw new Error(`Expected an object literal at ${location}`);
  }
  return value.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) ||
      (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) {
      throw new Error(`Expected a literal property at ${location}`);
    }
    return [property.name.text, property.initializer];
  });
}

function translationValue(node: ts.Expression, location: string): TranslationValue {
  const value = unwrapExpression(node);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.map((element) => {
      if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) return element.text;
      throw new Error(`Expected a string literal at ${location}`);
    });
  }
  throw new Error(`Expected a string or string-array literal at ${location}`);
}

function extractTranslationSource(content: string, filePath: string): Translations {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((variable) => ts.isIdentifier(variable.name) && variable.name.text === "TRANSLATIONS");
  if (!declaration) throw new Error(`Could not find TRANSLATIONS map in ${filePath}`);

  const locales = new Map(objectProperties(declaration.initializer, `${filePath}:TRANSLATIONS`));
  const readLocale = (locale: "en" | "am"): Record<string, TranslationValue> => Object.fromEntries(
    objectProperties(locales.get(locale), `${filePath}:TRANSLATIONS.${locale}`).map(([key, value]): [string, TranslationValue] => [
      key,
      translationValue(value, `${filePath}:TRANSLATIONS.${locale}.${key}`),
    ]),
  );
  return { en: readLocale("en"), am: readLocale("am") };
}

function extractTranslations(filePath: string): Translations {
  const absolutePath = path.resolve(__dirname, "..", filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File does not exist: ${absolutePath}`);
  }
  const fileContent = fs.readFileSync(absolutePath, "utf-8");
  return extractTranslationSource(fileContent, filePath);
}

describe("Translation literal extraction", () => {
  it("preserves semicolons, escaped quotes, braces and string arrays without truncating the map", () => {
    const content = String.raw`
      const TRANSLATIONS: Record<string, Record<string, string | string[]>> = {
        en: {
          message: "Retry or cancel; preserve \"quoted {notes}\" and \\.",
          "key; with {braces}": "The text includes }; before the end.",
          lines: ["First; line", "Second \"quoted\" line"],
        },
        am: {
          message: "AM; preserve \"quoted {notes}\" and \\.",
          "key; with {braces}": "AM includes }; before the end.",
          lines: ["AM first; line", "AM second \"quoted\" line"],
        },
      };
      throw new Error("Application source must not execute");
    `;
    expect(extractTranslationSource(content, "fixture.tsx")).toEqual({
      en: {
        message: 'Retry or cancel; preserve "quoted {notes}" and \\.',
        "key; with {braces}": "The text includes }; before the end.",
        lines: ["First; line", 'Second "quoted" line'],
      },
      am: {
        message: 'AM; preserve "quoted {notes}" and \\.',
        "key; with {braces}": "AM includes }; before the end.",
        lines: ["AM first; line", 'AM second "quoted" line'],
      },
    });
  });

  it("reads literal maps with TypeScript assertions without evaluating expressions", () => {
    const content = 'const TRANSLATIONS = ({ en: { title: `Hello; {world}` }, am: { title: "Hello" } } as const) satisfies Record<string, unknown>;';
    expect(extractTranslationSource(content, "fixture.tsx")).toEqual({
      en: { title: "Hello; {world}" }, am: { title: "Hello" },
    });
  });

  it("rejects executable translation values rather than running them", () => {
    const content = 'const TRANSLATIONS = { en: { title: (() => { throw new Error("Executed"); })() }, am: { title: "Hello" } };';
    expect(() => extractTranslationSource(content, "fixture.tsx")).toThrow("Expected a string or string-array literal");
  });

  it.each([
    'const OTHER = { en: {}, am: {} };',
    'const TRANSLATIONS = { en: {} };',
    'const TRANSLATIONS = { en: { ...external }, am: {} };',
    'const TRANSLATIONS = { en: { lines: [readValue()] }, am: {} };',
  ])("rejects unsupported or missing literal maps: %s", (content) => {
    expect(() => extractTranslationSource(content, "fixture.tsx")).toThrow();
  });
});

describe("Translation Symmetries & i18n Completeness", () => {
  const targets = [
    "app/events/[id]/page.tsx",
    "app/events/page.tsx",
    "app/events/proposals/page.tsx",
    "app/events/proposals/new/page.tsx",
    "app/events/proposals/[id]/page.tsx",
    "app/hr/expenses/approve/page.tsx",
    "app/hr/reports/profit/page.tsx",
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
