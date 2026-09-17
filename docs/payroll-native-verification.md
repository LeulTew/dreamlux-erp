# Reproducible payroll verification (issue 239)

These are **verification-only** commands. They do not deploy, migrate an existing
environment, initialize production data, or use the normal backend entrypoint.
An implemented workflow is not evidence of a green hosted run. The owner retains
native/browser integration approval and release control.

## Ownership and prerequisites

Run from an isolated, credential-free Git checkout, never alongside an unrelated
application instance. Install the existing locked dependencies with Bun before
verification. No dependency installation or production fallback occurs inside
the native runner.

- Bun: CI pins **1.3.14**; the locally inspected command behavior is Bun 1.4.
  Always invoke the commands with `bun --no-env-file`.
- Node.js 22 and the existing frontend/backend dependencies.
- A separately owned, disposable PostgreSQL **16.15** cluster:
  `127.0.0.1:55434`, role `dreamlux_parity`, admin database `postgres`,
  and an explicitly supplied 64-character lowercase hexadecimal password.
  The role must create/drop its own fixture databases.
- PostgREST **16.3**, supplied using an absolute binary path.
- Linux x64: install the Chromium version associated with the locked Playwright
  package (`bun --no-env-file frontend/node_modules/playwright/cli.js install --with-deps chromium`).
  Windows x64 uses installed Microsoft Edge. Do not change the tests to a different
  browser silently.
- Ports **3126, 5326, 54334, and 54335 must be free**. The runner refuses occupied
  ports rather than reusing or terminating existing services. It does not own or
  stop the supplied PostgreSQL server.

Supply `DREAMLUX_NATIVE_TEST_ADMIN_URL` privately in the launching environment.
The only accepted URI query is the exact `?sslmode=disable`, intended for the
disposable CI PostgreSQL service. The default remains TLS. All original strict
host, port, user, password and database checks still apply; `host`, `options`,
alternate databases, duplicate query keys and other overrides are rejected.
Do not supply inherited `DATABASE_*`, `PG*`, `POSTGRES*`, `PGRST*`, application
secrets, baseline flags, or an existing browser descriptor.

The CI service listens on **55434 inside the container**, using `PGPORT=55434`
and `55434:55434`. A `55434:5432` mapping would fail the native tests' independent
`inet_server_port()` check. The workflow password is deliberately public,
CI-only synthetic data, not a reusable credential.

## Local CI path

From the repository root, after privately configuring the owned admin target:

```sh
bun --no-env-file run verify:payroll:local --allow-disposable-postgres --postgrest /absolute/owned-tools/postgrest --frontend-build .qa-payroll-build
```

This runs release-hold and infrastructure boundary tests, infrastructure types,
guarded backend unit tests, isolated frontend lint/types/unit tests, **one**
production frontend build, then native API/PG assertions and the actual browser
suite. `.qa-payroll-build` must not already exist; another run's artifact is never
overwritten automatically.

For separate stages, or to reuse the same verified application build:

```sh
bun --no-env-file run verify:payroll:infra
bun --no-env-file run verify:payroll:build --checks --output .qa-payroll-build
bun --no-env-file run verify:payroll:native --allow-disposable-postgres --postgrest /absolute/owned-tools/postgrest --frontend-build .qa-payroll-build
```

Windows uses the same commands with an absolute Windows binary path and
`--postgrest-sha256 <independently-verified-Windows-binary-hash>`. Do not use an
unverified executable merely because it prints the expected version.

### Pinned PostgREST download

The CI download is not `latest`:

- Archive:
  `https://github.com/PostgREST/postgrest/releases/download/v16.3/postgrest-v16.3-linux-static-x86-64.tar.xz`
- Archive SHA-256 (release-asset metadata):
  `4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d`
- Extracted Linux x64 binary SHA-256 (independently supplied reference):
  `0cf367dc2ee47d5c648baa2952e25bdf299de4e1998d31e251bb00d129262d71`

CI checks the archive before extraction, the binary after extraction, and the
version banner. The native runner rechecks the binary checksum before executing
it with any fixture environment. The official Windows v16.3 ZIP archive digest
is `5ea4b57b10a26be45521e8e31476a91084c8fe91e060951f04985d86e79367fa`;
verify that archive and independently establish its extracted executable hash.

## What is isolated

The frontend snapshot is an explicit Git-file whitelist:

- `src`, `public`, and `e2e`;
- package/lock, TypeScript, lint, Vitest and PostCSS metadata;
- the repository-owned payroll QA environment and Playwright configuration;
- the isolated payroll Next configuration, installed as `next.config.ts`.

The original provider/Next configuration, `.env*`, `env-pulled-prod.local`,
`.vercel`, MCP/project links, and symlinked source trees are not copied.
Existing dependency directories are linked deliberately and unlinked before
private-directory cleanup; they are never recursively traversed for deletion.

Next build/server environments contain only allowlisted OS settings, UTC,
telemetry opt-out, and explicit harmless public targets:

- API: `http://127.0.0.1:5326`
- Supabase-shaped test target: `http://127.0.0.1:54335`
- deliberately synthetic public keys

A controlled Node preload blocks unapproved HTTP/fetch/TCP/TLS/WebSocket access.
Builds permit only the reviewed Google font GET origins; they cannot contact a
possibly running local API. Serving permits only the owned loopback UI/API/test
origins. No inherited Node preloads or database credentials reach Next.

The lint stage allows 90 seconds on Windows, where a dependency-junction scan
was measured at 73.3 seconds, and 45 seconds on Linux. This does not extend the
hosted job caps or allow automatic retries.

Backend units use an explicit 30-second per-test runner limit within the
unchanged 150-second local suite budget and three-minute hosted job cap. The
inherited 20,000-invalidation cache test took 5.34 seconds in one combined run
and 2.81 seconds in isolation, crossing Bun's default five-second limit. No
assertion, iteration count, production cache logic or job cap was weakened;
this is runner headroom, not a claim that cache performance was repaired.

The native runner reuses `createDreamluxPayrollFixture` and the reviewed
18-table DDL/index/activity-RLS bootstrap, including the two existing settings
prefix columns from `migrate-settings.ts`. That migration program is never
executed; only its reviewed column definitions are used in the fixture. This
prevents successful-looking weekly defaults from hiding a failed settings read.
The fixture creates a new
`dreamlux_ephemeral_payroll_239_*` database and independent fresh application and
REST signing secrets. It starts its own PostgREST process with five pooled
connections and no anonymous database role. Readiness requires an
unauthenticated401, not privileged anonymous access. The native test owns the
REST prefix proxy, real auth/payroll API and synthetic SRD data. Native APIs run
with `NODE_ENV=development` so database-backed authorization is exercised,
rather than the application's unit-test shortcut. Environment loading remains
blocked and all bindings remain synthetic loopback targets. No seed
records or legacy instance data are copied.

The Playwright test runner receives the private descriptor and native control
environment. Browser subprocesses receive a separate OS-only environment.
Browsers are serial, one worker, zero retries, at desktop 1440x900 and mobile
390x844. General traces/videos are disabled to avoid publishing session cookies;
raw reports and generated screenshots remain inside the private run directory.

## Receipts, deadlines and cleanup

The native invocation is intentionally ordered:

```sh
bun --no-env-file test --config=./bunfig.native.toml --timeout=30000 --reporter=junit --reporter-outfile=<private-report> src/db/payroll-publication.integration.test.ts
```

Putting `--config` before `test` previously returned exit zero with no tests on
Bun 1.4. The runner therefore requires all of:

- zero exit status, the native guard banner and expected source file;
- at least **56 native tests**, zero failures/skips, one test file;
- matching JUnit totals and actual testcase entries;
- a nonempty browser registry discovered with Playwright `--list` using the
  same snapshot, environment (apart from the private report path), serial
  desktop/mobile configuration and selection as execution;
- both publication and preview files present in each browser project;
- exact equality between discovered and executed test identities, including
  project, source location and title path: no omitted, substituted, duplicated
  or extra tests, and no skips, retries, flaky results or total disagreement.

Browser counts are derived from discovery, not a fixed workflow count. The
parent-observed registry now contains publication and preview browser cases,
including parameterized light/dark layout checks, but no prior case count is an execution
threshold in the runner. Discovery itself executes no tests and is not counted
as business coverage. The final receipt includes the requested count and registry
digest alongside actual per-project results.

Native assertions finish **before** browser-provider mode starts and reseeds the
same owned database. Provider mode uses the same native test with
`DREAMLUX_NATIVE_BROWSER_SERVER=1`, never the historical baseline. Its eventual
**one passing test is infrastructure, not business coverage**.

The private descriptor must identify the runner's newly created database and
fixed API origin. Graceful shutdown uses its private key at
`POST http://127.0.0.1:5326/__qa/shutdown`. Values are not logged. Unexpected
server-side egress markers also fail verification, even if application code
catches the underlying error.

Success is printed only after browser/provider receipts and owned cleanup:
process trees stop, fixture disposal runs, reserved ports and the checkout lock
are released, and the private source/receipt directory is removed. Cleanup
attempts continue after individual failures and failures are reported, not hidden.
If cleanup is incomplete, an ignored private recovery directory is retained;
its `ownership.json` identifies only the disposable fixture for the operator.
Do not publish that directory. Forced OS termination can still require operator
cleanup of the separately owned cluster.

The frontend artifact includes runtime-file hashes, required payroll page and
rewrite manifests, the build ID, platform, and a production-source fingerprint.
An absent, stale or altered artifact fails; the native job never falls back to
another build. Test-only changes do not force a second application build.

## CI and runner-minute forecast

The original push/PR branch filters, concurrency cancellation and existing jobs
remain. Their three-minute caps remain unchanged. The new `native-payroll` job
depends on both, consumes the single frontend artifact, and has a **five-minute**
cap. The native driver has its own 225-second work budget; browser global time is
120 seconds. These limits are not success guarantees.

Planning estimates, **not hosted measurements**:

| Job | Approximate runner time | Configured job cap |
| --- | --- | --- |
| Backend units/boundaries | 0.5-2 minutes | 3 minutes |
| Frontend checks/build/artifact | 1-3 minutes | 3 minutes |
| Native PG/REST and browsers | 2-4.5 minutes | 5 minutes |

Forecast **summed runner-minutes**: approximately 3.5-9.5 per run; configured
job caps sum to 11 minutes, apart from provisioning/cancellation overhead.
Parallel backend/frontend jobs do not make those billed minutes disappear.
The capped dependency-path wall time is about 8 minutes, not 5.
At those estimates, a fresh 2,000-minute allowance covers roughly 210-571 full
runs; at the combined 11-minute caps it covers 181 full runs. These are forecasts,
not permission to consume the allowance or rerun an unchanged head.

No hosted execution is needed to implement or review this wiring. Continue the
owner-authorized local-CI and `[skip ci]` policy while minutes are held. Do not
dispatch Actions, remove the production release hold, or claim CI green from
configuration/unit checks alone.

## Independently executed local evidence

For issue239, the repository-owned Linux pipeline was exercised with Bun 1.3.14, Node 22,
PostgreSQL 16.15 and the checksum-verified PostgREST 16.3 binary. Its actual native
stage passed 43 tests and its discovered desktop/mobile browser registry passed
all 22 tests without retries/skips, using the single verified frontend artifact.
The infrastructure-provider test is reported separately. Cleanup of the private
run directory, fixture database, ports and checkout lock is required before the
runner emits success.

The same application additionally passed 757 backend tests (43 native cases are
intentionally skipped in the mocked process and run separately), 548 frontend
tests, build/types/lint, and independent Windows browser checks. The verification
also corrected a pinned-runtime startup issue: Bun reports an initial local
connection refusal as `ConnectionRefused`; readiness now waits within its
existing deadline for that specific condition and still surfaces unknown errors.
These are local results, not hosted Actions or live production smoke evidence.

Issue233 extends the same registry with read-only preview, canonical metadata,
250-person paging, cancellation/late results, Amharic, and actual permission
revocation. Its discovery/receipt checks do not accept a publication-only run.
Native preview assertions verify zero payroll writes and unchanged saved-line
mappings, including a legacy employee without a usable human code.

The real revocation exercise also exposed issue242: a current permission lookup
could leave the old token map in force. Native fixtures now exercise the actual
authorization path and invalidate the actual in-process cache after a synthetic
role change. A timestamp-controlled unit case separately checks an invalidation
that arrives during a permission lookup. Native controls cover revoked grants,
removed roles and unavailable current-authority data. Earlier unit-test-mode
role checks are not claimed as proof of runtime permission revocation.
