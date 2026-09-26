import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

function source(path: string) {
  return ts.createSourceFile(path, readFileSync(join(__dirname, "..", ...path.split("\\")), "utf8"), ts.ScriptTarget.Latest, true);
}

function calls(file: ts.SourceFile, object: string, method: string) {
  return file.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return [];
    const call = statement.expression;
    if (!ts.isPropertyAccessExpression(call.expression)) return [];
    if (call.expression.expression.getText(file) !== object || call.expression.name.text !== method) return [];
    return [call];
  });
}

function route(file: ts.SourceFile, method: string, path: string) {
  const call = calls(file, "router", method).find((candidate) => {
    const arg = candidate.arguments[0];
    return arg && ts.isStringLiteral(arg) && arg.text === path;
  });
  if (!call) throw new Error(`Expected ${method} route registration`);
  return call.arguments.slice(1).map((arg) => arg.getText(file));
}

describe("source-bound upload authorization and JSON route boundaries (no app imports)", () => {
  test.each([
    ["routes\\assets.ts", 'requirePermissions("assets", "write")', "assetUpload"],
    ["routes\\employees.ts", 'requirePermissionSlugs(["hr:write"])', "employeeUpload"],
  ])("keeps permission before parsing in POST/PATCH: %s", (filePath, permission, upload) => {
    const file = source(filePath);
    for (const [method, path] of [["post", "/"], ["patch", "/:id"]]) {
      const chain = route(file, method, path);
      expect(chain[0]).toBe(permission);
      expect(chain[1]).toBe(upload);
      expect(chain[2]).toStartWith("async");
    }
  });

  test("keeps finance write permission before workbook preview parsing", () => {
    const chain = route(source("routes\\finance-imports.ts"), "post", "/hisab/preview");
    expect(chain[0]).toBe('requirePermissionSlugs(["finance:imports:write"])');
    expect(chain[1]).toBe("workbookUpload");
    expect(chain[2]).toStartWith("async");
  });

  test("keeps real authentication before every existing upload-router mount", () => {
    const file = source("index.ts");
    const mounts = calls(file, "app", "use");
    for (const [path, router] of [
      ["/assets", "assetsRouter"], ["/items", "assetsRouter"], ["/api/inventory", "assetsRouter"],
      ["/employees", "employeesRouter"], ["/finance/imports", "financeImportsRouter"],
      ["/api/finance/imports", "financeImportsRouter"],
    ]) {
      const mount = mounts.find((call) => ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === path);
      expect(mount?.arguments.slice(1).map((arg) => arg.getText(file))).toEqual(["requireAuth", router]);
    }
    const assets = source("routes\\assets.ts");
    expect(calls(assets, "router", "use")[0].arguments[0].getText(assets)).toBe("requireAuth");
  });

  test("leaves employee import and finance commit JSON-only with no upload middleware", () => {
    for (const [filePath, path, permission] of [
      ["routes\\employees.ts", "/import", 'requirePermissionSlugs(["hr:write"])'],
      ["routes\\finance-imports.ts", "/hisab/commit", 'requirePermissionSlugs(["finance:imports:write"])'],
    ]) {
      const chain = route(source(filePath), "post", path);
      expect(chain).toHaveLength(2);
      expect(chain[0]).toBe(permission);
      expect(chain[1]).toStartWith("async");
      expect(chain[1]).not.toContain("parseEmployeeEventPrices");
    }
  });

  test("normalizes/rejects prices before employee business/storage calls", () => {
    const file = source("routes\\employees.ts");
    for (const [method, path] of [["post", "/"], ["patch", "/:id"]]) {
      const body = route(file, method, path)[2];
      const validation = body.indexOf("parseEmployeeEventPrices(");
      expect(validation).toBeGreaterThan(0);
      for (const operation of ["await resolveSalaryLevelIdByCode(", "await supabase", "await uploadImage("]) {
        const position = body.indexOf(operation);
        if (position !== -1) expect(validation).toBeLessThan(position);
      }
    }
  });
});
