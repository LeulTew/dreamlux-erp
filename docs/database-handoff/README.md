# DreamLux database migration handoff

The versioned archive below preserves DreamLux's migration sources for a future
owner handoff. **It is not a database backup, approved replay chain, or evidence
of production migration parity.** No database query/export or project transfer
was performed to create it.

| Artifact | Details |
| --- | --- |
| [Source archive](dreamlux-migrations-75c2d427c1a7-v1.zip) | 73,844 bytes; 49 files |
| [Readable manifest](dreamlux-migrations-75c2d427c1a7-v1.manifest.json) | Per-file provenance, raw/LF SHA-256, classification, prerequisites and historical command ordering |
| [Remote applied status](dreamlux-migrations-75c2d427c1a7-v1.remote-status.json) | **Unknown**: separate DreamLux owner sign-in/catalog inspection is still required |
| Source commit | `75c2d427c1a77090e63c97ad29b0d9b4fcecc06d` |
| ZIP SHA-256 | `4c2fda11cba35921b5b6f3ae2041d9eb650b14f4a1577adacfd7174ddcdfe4cd` |
| Manifest SHA-256 | `0bf163a79a174775895de54d0dfbce7223d80ba6c94c7810aa833d3f3e998817` |

## Verify offline

Check the downloaded ZIP against the published hash, extract it to a new folder,
then run `bun --no-env-file verify.mjs` inside that folder. The standalone verifier
checks all file sizes, raw/LF-normalized hashes and the exact file inventory
without loading app code, environment files, dependencies or network clients.
Read the archive's `README.md` before using any SQL.

All 40 tracked SQL sources are accounted for: one legacy baseline, 37 migration
files, one read-only diagnostic and one excluded seed file. The archive contains
43 unchanged source files, one explicitly sanitized migration extract, one
provenance-hashed inline prerequisite extract, three supporting files and its
manifest. It is pinned to the source commit above; it is not a moving export of
the current branch.

## Important exclusions and limitations

The older `20260710_inventory_dispatch_permissions.sql` mixes permission changes
with a user/password bootstrap. Only its original lines 1-13 are distributed,
under `sanitized/`; its original Git identity/checksums are recorded without
redistributing the credential-bearing block. Standalone sample/personnel seeds,
business-data copiers, backups, environment files, database URLs, tokens,
passwords, Auth/account data, Storage objects, deployment links and logs are
excluded.

Historical SQL still includes role/permission catalogs, default settings and
data transformations. Do not mistake this for DDL-only provisioning or apply it
to current financial history/grants. The fuel migrations overlap; the pricing
migrations represent opposing historical transitions; inline audit/history
prerequisites are separately labeled. Manifest order and package-script order
are **not** a certified clean replay sequence.

Transferring an **existing Supabase project between organizations** is distinct
from provisioning a new project or moving regions. Do not replay migrations
merely because ownership changes. Owners must separately review the current
[Supabase transfer requirements](https://supabase.com/docs/guides/platform/project-transfer),
access, integrations and billing implications. This archive does not transfer
or back up accounts, application data, database roles or Storage objects.

For application deployment safeguards, see the
[production release runbook](../production-release.md). Record future
authenticated remote schema/history evidence separately; do not rewrite this
archive's unknown status as a claim that its migrations were applied.
