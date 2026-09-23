# Runtime dependency and multipart boundaries (#287)

The frontend pins `next` and `eslint-config-next` to **16.3.3**. The backend pins
`multer` to **2.3.0** and `@types/multer` to **2.2.0**. Each application owns its Bun
lock. Frontend React/React DOM remain 19.2.3; the independent root manifest/lock,
Webpack development/build commands, `next start`, and all three Vercel
`git.deploymentEnabled.main: false` holds are unchanged.

## Upload contracts and intentional new ceilings

Authentication and route-specific permissions still run before the parser.
`backend/src/lib/multipart.ts` shares the bounded memory-storage middleware;
the asset, employee, and finance routers retain their existing business handlers.

| Parser | Accepted files | Text fields | Parts limit | Nesting / numeric index | Entire request |
| --- | --- | ---: | ---: | --- | ---: |
| Asset POST/PATCH | One `image`, JPEG/PNG | 5 | 7 | 0 / 0 | 18 MiB |
| Employee POST/PATCH | One each of `id_card_front`, `id_card_back`, `profile_photo`, JPEG/PNG/WebP | 1,011 | 1,015 | 1 / 0 | 44 MiB |
| Hisab preview | One `workbook` | 0 | 2 | 0 / 0 | 12 MiB |

All files retain the configured **10 MiB each** limit and the usual Multer
`buffer`, `size`, `originalname`, and single/named-file shapes. Multer 2.3 corrects
the upstream boundary: exactly 10 MiB is accepted; 10 MiB plus one byte is not.
The old 1.x parser rejected exactly 10 MiB.

Field values retain the existing 1 MiB setting, including Busboy's truncation
behavior at that boundary (1 MiB minus one byte is accepted; exactly 1 MiB is
rejected). Field names have the explicit 100-byte setting and a post-parse
100-byte UTF-8 name check, including bracket notation. The latter is conservative
for non-ASCII names decoded by Busboy's existing default charset. The header-pair
setting remains 2,000. Parts limits are fields + files + **1**, because Busboy
signals `partsLimit` when the counter reaches the configured number.

These field-count, structure, logical-price-count, and aggregate-byte ceilings
are **new resource policies**, not pre-existing DreamLux business limits or a
claim of human approval of historical behavior.

- Assets have `name`, `quantity`, `store_id`, `description`, plus `clone_from_id`.
  Image-less partial updates and image cloning remain supported.
- Employees have ten ordinary schema fields (`full_name`, `employee_id`,
  `department_id`, `phone`, `email`, `commission`, `commission_type`,
  `salary_level`, `compensation_mode`, `office_id`) plus `clone_from_id`.
  `event_prices` retains both JSON-string and one-level bracketed-record input.
  Up to **1,000 logical event-price entries** are accepted in either representation.
  The shared normalization preserves `Number(value ?? 0)`, blank/legacy empty
  forms, and finite non-negative prices, with no new UUID restriction on keys.
  Counts and invalid prices are checked before image processing/storage or
  employee business calls. Direct JSON create/update normalization shares the
  entry ceiling; it does not acquire a multipart byte/count limit.
- The workbook filter intentionally keeps **extension OR MIME** acceptance:
  a case-insensitive `.xlsx` extension, the XLSX MIME, or
  `application/octet-stream`. This filter is not proof that a workbook is valid;
  the existing workbook service remains responsible for parsing it.

Employee JSON `/import` and finance JSON `/hisab/commit` do not use this
middleware and are unchanged.

The employee aggregate budget leaves 30 MiB for files, 12 MiB for the legacy
scalar/JSON fields, and 2 MiB framing headroom. Assets have 18 MiB total headroom;
finance has 10 MiB plus 2 MiB. Bracketed prices cannot expand the employee request
to 1,011 MiB: the **44 MiB actual-stream budget also applies**.

## Failure and lifecycle behavior

The guard counts actual incoming bytes, including multipart framing, preambles,
and epilogues. It does not trust `Content-Length`, accumulate a second body,
replace `req.pipe`/`req._read`, or start an application/listener.

On overflow, a prepended counter signals a typed request error. Multer 2.3's
request-error path synchronously unpipes/destroys Busboy, so an already-captured
pipe listener cannot parse the violating chunk. Failure clears partial
`req.body`, `req.file`, and `req.files`, forwards one safe error, and closes the
remaining request after the response finishes/closes. Late parser completion
can only clear partial state again, not call a business handler. Success waits
for complete request EOF. Aborted/early-closed transports fail, never succeed.

| Outcome | HTTP status when the response is still writable |
| --- | ---: |
| Wire, file, field, part, name, nesting, index, or logical-price ceiling | 413 |
| Malformed/incomplete upload, unexpected file, invalid price payload | 400 |
| Unsupported image/workbook type | 415 |
| Unknown internal parser failure | 500 with a generic message |

Error objects contain safe codes and the parser category, not uploaded filenames,
field names/values, or the original internal exception. The existing Express
error boundary logs them. An already-ended/disconnected response is not written
again; a context-only failure is logged and the request is destroyed. These
bounds do not claim to be global concurrency limits or upload-time deadlines.

## Advisory scope and verification boundaries

First-party advisories: [Windows-hosted Next RCE](https://github.com/advisories/GHSA-p293-qw3h-jr36),
[AVIF optimization RCE](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4),
[Multer field-name failure](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm),
and [Multer sparse-index DoS](https://github.com/advisories/GHSA-535w-7cp7-47q4).
The affected 16.x Next range ends at 16.3.3; the Multer fixes require 2.3.0
**and an explicit finite array-index policy**. Exact-target advisory checks were
made before changing the manifests.

DreamLux does **not** globally disable image optimization. In particular,
`EditAssetSheet` disables it only for data URLs; remote previews retain the
optimizer. The upgrade does not borrow a different application's optimizer
exemption or change DreamLux's remote patterns/API rewrite. The Windows advisory
is conditional on hosting/filesystem/runtime exposure; no active exposure,
production exploit, or compromise is asserted.

Run the focused provider-free backend checks from the repository root:

```powershell
bun --no-env-file --config=.\backend\bunfig.backup.toml test .\backend\src\lib\multipart.test.ts .\backend\src\lib\multipart-routes.test.ts
bun --no-env-file .\backend\node_modules\typescript\bin\tsc --project .\backend\tsconfig.json --noEmit
bun --no-env-file .\backend\node_modules\eslint\bin\eslint.js --config .\backend\eslint.config.mjs .\backend\src\lib\multipart.ts .\backend\src\lib\multipart.test.ts .\backend\src\lib\multipart-routes.test.ts .\backend\src\routes\assets.ts .\backend\src\routes\employees.ts .\backend\src\routes\finance-imports.ts
```

These use real Multer and in-memory request/response streams, not `index.ts`,
provider modules, credentials, or sockets bound to a port. Source-AST checks
verify the real router/auth mount ordering; synthetic denial controls establish
that denied requests never reach parsing or business callbacks. They do not
pretend to be a deployed end-to-end auth/provider test.

Build verification must use reviewed tracked frontend sources, unchanged
`next.config.ts`, a loopback `NEXT_PUBLIC_API_URL`, no `.env`/provider credentials
or deployment links, and outbound access limited to genuine HTTPS Google font
GETs at `fonts.googleapis.com` and `fonts.gstatic.com`. Do not replace font
downloads with mocks and call that a production build.

Independent final-diff review, explicitly authorized browser checks, fresh-main
integration/publication, and actual-merge verification remain separate gates.
Historical UI/RSC cancellation observations are not retrospectively explained
by this upgrade. Deployed configuration, credential retirement, database catalog,
recovery readiness, and production rollout are not fixed or authorized by #287.
