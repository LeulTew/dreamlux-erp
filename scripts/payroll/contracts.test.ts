import { describe, expect, test } from "bun:test";
import { join, sep } from "node:path";
import {
  browserArguments, browserDescriptor, browserReceipt, browserRegistry, bunReceipt, nativeArguments, nativeEnvironment, nativePlan,
  NATIVE_GUARD_BANNER, NATIVE_TEST, POSTGREST_LINUX_BINARY_SHA256, selectedFrontendFile,
  verifyJunitReceipt,
} from "./contracts";
import { payrollPublicEnvironment, payrollSystemEnvironment, payrollUiEnvironment } from "../../frontend/payroll-qa-environment";
import { CleanupStack, redact } from "./processes";

const root = process.cwd();
const admin = `postgresql://dreamlux_parity:${"a".repeat(64)}@127.0.0.1:55434/postgres?sslmode=disable`;
const fixture = admin.replace("/postgres?", "/dreamlux_ephemeral_payroll_239_012345abcdef?");
const args = ["--allow-disposable-postgres", "--postgrest", "tools/postgrest", "--frontend-build", ".qa-payroll-build"];
const output = (passed = 43) => `${NATIVE_TEST}:\n${NATIVE_GUARD_BANNER}\n ${passed} pass\n 0 fail\nRan ${passed} tests across 1 file.\n`;

describe("payroll runner pre-client boundaries", () => {
  test("accepts only the explicit disposable target and pinned binary plan", () => {
    expect(nativePlan(args, { DREAMLUX_NATIVE_TEST_ADMIN_URL: admin }, root, "linux", "x64")).toEqual({
      adminUrl: admin, postgrest: join(root, "tools", "postgrest"),
      artifact: join(root, ".qa-payroll-build"), postgrestSha256: POSTGREST_LINUX_BINARY_SHA256,
    });
  });
  test.each([
    { input: [] },
    { input: [...args, "--grep", "one test"] },
    { input: [...args, "--postgrest", "other-binary"] },
    { input: [...args, "--allow-disposable-postgres"] },
    { input: [...args, "--postgrest-sha256", "b".repeat(64)] },
  ])("rejects ambiguous or coverage-reducing command lines without clients", ({ input }) => {
    expect(() => nativePlan(input, { DREAMLUX_NATIVE_TEST_ADMIN_URL: admin }, root, "linux", "x64")).toThrow();
  });
  test.each([
    { name: "DATABASE_URL" }, { name: "DATABASE_BACKUP_URL" }, { name: "DATABASE_DIRECT_URL" },
    { name: "JWT_SECRET" }, { name: "DREAMLUX_NATIVE_USE_BASELINE" }, { name: "DREAMLUX_E2E_BASELINE" },
    { name: "DREAMLUX_NATIVE_BROWSER_DESCRIPTOR" }, { name: "PGOPTIONS" }, { name: "PGRST_DB_URI" },
  ])("refuses inherited $name rather than forwarding it", ({ name }) => {
    expect(() => nativePlan(args, { DREAMLUX_NATIVE_TEST_ADMIN_URL: admin, [name]: "synthetic-unapproved" }, root, "linux", "x64")).toThrow();
  });
  test("rejects a remote/legacy/query-override target at the plan boundary", () => {
    for (const target of [admin.replace("127.0.0.1", "db.invalid"), `${admin}&host=db.invalid`, admin.replace("/postgres?", "/legacy?")]) {
      expect(() => nativePlan(args, { DREAMLUX_NATIVE_TEST_ADMIN_URL: target }, root, "linux", "x64")).toThrow();
    }
  });
  test("never gives the UI or browser database/application secrets or inherited Node preloads", () => {
    const source = {
      PATH: "synthetic-system-path", DATABASE_URL: fixture, JWT_SECRET: "b".repeat(64),
      DREAMLUX_TEST_REST_JWT_SECRET: "c".repeat(64), SUPABASE_SERVICE_ROLE_KEY: "synthetic-private-key",
      NODE_OPTIONS: "--require unapproved.cjs", RANDOM_PRIVATE_SETTING: "must-not-forward",
      NEXT_PUBLIC_API_URL: "https://unapproved.invalid",
    };
    expect(payrollSystemEnvironment(source)).toEqual({ PATH: source.PATH, TZ: "UTC" });
    expect(payrollUiEnvironment(source)).toEqual({
      PATH: source.PATH, TZ: "UTC", ...payrollPublicEnvironment, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production",
    });
    const child = nativeEnvironment(source, admin, fixture, "d".repeat(64), "e".repeat(64));
    expect(child.DATABASE_URL).toBe(fixture);
    expect(child.DATABASE_BACKUP_URL).toBe("");
    expect(child.DATABASE_DIRECT_URL).toBe("");
    expect(child.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(child.NODE_OPTIONS).toBeUndefined();
    expect(child.JWT_SECRET).toBe("d".repeat(64));
    expect(child.DREAMLUX_TEST_REST_JWT_SECRET).toBe("e".repeat(64));
  });
  test("requires independent fixture and signing identities", () => {
    expect(() => nativeEnvironment({}, admin, fixture, "d".repeat(64), "d".repeat(64))).toThrow();
    expect(() => nativeEnvironment({}, admin, fixture, "a".repeat(64), "d".repeat(64))).toThrow();
    expect(() => nativeEnvironment({}, admin, fixture.replace("012345abcdef", "not-an-owned-id"), "d".repeat(64), "e".repeat(64))).toThrow();
  });
  test("puts --config after test, uses the native-only preload, and never selects a subset", () => {
    const command = nativeArguments(join(root, "private.junit.xml"));
    expect(command.slice(0, 4)).toEqual(["--no-env-file", "test", `--config=.${sep}bunfig.native.toml`, "--timeout=30000"]);
    expect(command.at(-1)).toBe(NATIVE_TEST.split("/").join(sep));
    expect(command.some((arg) => /grep|retry|rerun|test-name/.test(arg))).toBe(false);
  });
  test("discovers and executes exactly the same browser selection", () => {
    expect(browserArguments()).toEqual(["--no-env-file", "run", "test:e2e:payroll"]);
    expect(browserArguments(true)).toEqual([...browserArguments(), "--list"]);
  });
});

describe("credential-free snapshot selection", () => {
  test.each(["frontend/.env", "frontend/env-pulled-prod.local", "frontend/.vercel/project.json", "frontend/.vscode/mcp.json", "frontend/next.config.ts", "frontend/vercel.json"])(
    "never selects provider configuration %s", (file) => expect(selectedFrontendFile(file)).toBe(false),
  );
  test.each(["frontend/src/.env.test", "frontend/e2e/nested/project.json", "frontend/public/.vercel/project.json", "frontend/src/../../outside.ts"])(
    "refuses concealed configuration/traversal %s", (file) => expect(() => selectedFrontendFile(file)).toThrow(),
  );
  test.each(["frontend/src/app/hr/payments/page.tsx", "frontend/public/logo.png", "frontend/e2e/issue239-payroll-native.spec.ts", "frontend/next.payroll-native.config.ts"])(
    "selects reviewed source %s", (file) => expect(selectedFrontendFile(file)).toBe(true),
  );
});

describe("test receipts cannot confuse infrastructure with financial coverage", () => {
  test("accepts real nonzero native totals, and labels the one provider test separately", () => {
    expect(bunReceipt(output(), 0, "native").passed).toBe(43);
    expect(bunReceipt(output(1), 0, "provider").passed).toBe(1);
    expect(() => bunReceipt(output(1), 0, "native")).toThrow();
  });
  test.each([
    { text: "" }, { text: output(0) }, { text: output().replace(NATIVE_GUARD_BANNER, "") },
    { text: output().replace(NATIVE_TEST, "mocked.test.ts") }, { text: output().replace("0 fail", "1 fail") },
    { text: output().replace("0 fail", "0 fail\n 1 skip") }, { text: output().replace("across 1 file", "across 2 files") },
  ])("rejects absent, skipped, failed, or wrong-runner output", ({ text }) => {
    expect(() => bunReceipt(text, 0, "native")).toThrow();
  });
  test("rejects a nonzero process exit even if a passing footer exists", () => {
    expect(() => bunReceipt(output(), 1, "native")).toThrow();
  });
  test("cross-checks native XML totals and actual testcase entries against the process receipt", () => {
    const receipt = bunReceipt(output(1), 0, "provider");
    const xml = '<?xml version="1.0"?><testsuites tests="1" failures="0" skipped="0"><testsuite><testcase name="synthetic provider"/></testsuite></testsuites>';
    expect(() => verifyJunitReceipt(xml, receipt)).not.toThrow();
    expect(() => verifyJunitReceipt(xml.replace('tests="1"', 'tests="0"'), receipt)).toThrow();
    expect(() => verifyJunitReceipt(xml.replace('<testcase name="synthetic provider"/>', ""), receipt)).toThrow();
    expect(() => verifyJunitReceipt(`${xml}truncated`, receipt)).toThrow();
  });
  const descriptor = {
    apiOrigin: "http://127.0.0.1:5326", writerCookie: "token=synthetic-writer",
    readerCookie: "token=synthetic-reader", shutdownKey: "f".repeat(48), database: "dreamlux_ephemeral_payroll_239_012345abcdef",
  };
  test("binds private shutdown readiness to exactly this newly created database", () => {
    expect(browserDescriptor(descriptor, fixture)).toEqual(descriptor);
    expect(() => browserDescriptor({ ...descriptor, database: "dreamlux_ephemeral_payroll_239_abcdef012345" }, fixture)).toThrow();
    expect(() => browserDescriptor({ ...descriptor, apiOrigin: "https://unapproved.invalid" }, fixture)).toThrow();
    expect(() => browserDescriptor({ ...descriptor, shutdownKey: "invalid" }, fixture)).toThrow();
  });
  const report = (perProject = 11, discovery = false) => ({
    config: {
      workers: 1, fullyParallel: false, forbidOnly: true,
      projects: ["desktop", "mobile"].map((name) => ({ id: name, name, repeatEach: 1, retries: 0 })),
    },
    errors: [], stats: { expected: discovery ? 0 : perProject * 2, unexpected: 0, skipped: discovery ? perProject * 2 : 0, flaky: 0 },
    suites: [{ title: "issue239-payroll-native.spec.ts", specs: Array.from({ length: perProject }, (_, index) => ({
      id: `synthetic-${index}`, title: `Synthetic contract ${index}`, ok: true,
      file: "issue239-payroll-native.spec.ts", line: index + 1, column: 1,
      tests: ["desktop", "mobile"].map((projectName) => ({
        projectId: projectName, projectName, expectedStatus: "passed", status: discovery ? "skipped" : "expected",
        results: discovery ? [] : [{ status: "passed", retry: 0 }],
      })),
    })) }],
  });
  test.each([1, 11, 14])("uses all %i discovered cases per project without a hard-coded coverage count", (count) => {
    const requested = browserRegistry(report(count, true), 0);
    expect(browserReceipt(report(count), 0, requested)).toEqual({
      desktop: count, mobile: count, requested: count * 2, passed: count * 2, retries: 0, skipped: 0,
    });
  });
  test("rejects the former workflow-only receipt when discovery also requested layout cases", () => {
    const requested = browserRegistry(report(11, true), 0);
    expect(() => browserReceipt(report(9), 0, requested)).toThrow("exactly the discovered");
  });
  test("requires all discovered desktop/mobile tests to pass once without skips or retries", () => {
    const requested = browserRegistry(report(11, true), 0);
    const retried = report();
    retried.suites[0].specs[0].tests[0].results[0].retry = 1;
    expect(() => browserReceipt(retried, 0, requested)).toThrow();
    const missing = report();
    missing.suites[0].specs.pop();
    expect(() => browserReceipt(missing, 0, requested)).toThrow();
    const skipped = report();
    skipped.stats.skipped = 1;
    expect(() => browserReceipt(skipped, 0, requested)).toThrow();
    expect(() => browserReceipt({ errors: [], suites: [], stats: {} }, 0, requested)).toThrow();
  });
  test("rejects substitutions and duplicates even when aggregate counts still match", () => {
    const requested = browserRegistry(report(11, true), 0);
    const substituted = report();
    substituted.suites[0].specs[0].id = "not-requested";
    expect(() => browserReceipt(substituted, 0, requested)).toThrow("exactly the discovered");
    const duplicate = report();
    duplicate.suites[0].specs[1] = duplicate.suites[0].specs[0];
    expect(() => browserReceipt(duplicate, 0, requested)).toThrow("Duplicate browser test identity");
  });
  test("ignores result ordering, not identity or project membership", () => {
    const requested = browserRegistry(report(11, true), 0);
    const reordered = report();
    reordered.suites[0].specs.reverse().forEach((spec) => spec.tests.reverse());
    expect(browserReceipt(reordered, 0, requested).passed).toBe(requested.tests.length);
    const wrongProject = report();
    wrongProject.suites[0].specs[0].tests[0].projectName = "unexpected-project";
    expect(() => browserReceipt(wrongProject, 0, requested)).toThrow();
  });
  test("rejects empty, duplicate, skipped or executed discovery entries", () => {
    expect(() => browserRegistry(report(0, true), 0)).toThrow();
    expect(() => browserRegistry(report(), 0)).toThrow();
    const duplicate = report(11, true);
    duplicate.suites[0].specs[1] = duplicate.suites[0].specs[0];
    expect(() => browserRegistry(duplicate, 0)).toThrow();
    const skipped = report(11, true);
    skipped.suites[0].specs[0].tests[0].expectedStatus = "skipped";
    expect(() => browserRegistry(skipped, 0)).toThrow();
    const retrying = report(11, true);
    retrying.config.projects[0].retries = 1;
    expect(() => browserRegistry(retrying, 0)).toThrow();
  });
});

describe("private diagnostics and cleanup ordering", () => {
  test("redacts known tokens, generated hex values, JWTs and fixture identities", () => {
    const secret = "f".repeat(48);
    const text = `${fixture} ${"b".repeat(64)} eyJhbGciOiJIUzI1NiJ9.c3ludGhldGlj.c2lnbmF0dXJl ${secret}`;
    const safe = redact(text, [secret]);
    expect(safe).not.toContain(secret);
    expect(safe).not.toContain("b".repeat(64));
    expect(safe).not.toContain("dreamlux_ephemeral_");
    expect(safe).not.toContain("eyJ");
  });
  test("attempts every owned cleanup in reverse order, without swallowing failure", async () => {
    const calls: string[] = [];
    const cleanup = new CleanupStack();
    cleanup.defer("database", async () => { calls.push("database"); });
    cleanup.defer("REST", async () => { calls.push("REST"); throw new Error("Synthetic cleanup failure"); });
    cleanup.defer("browser", async () => { calls.push("browser"); });
    await expect(cleanup.close()).rejects.toThrow("cleanup was incomplete");
    expect(calls).toEqual(["browser", "REST", "database"]);
  });
});
