# DreamLux Storage snapshots

`bun run backup:storage` still uses `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and the configured `SUPABASE_BUCKET` (default:
`inventory-images`). The combined `backup` command still runs Storage before
the database backup and stops if Storage fails.

**Artifact layout changed:** completed exports are immutable snapshot
directories beneath `backups/storage`, not updates to a mutable raw-key tree.
Use the exact directory printed by the command. Earlier exports are left
untouched and are not retroactively certified by the new verifier.

## Configuration and execution

Attest the configured DreamLux provider/project, bucket and server credential
before running a real backup. Preserve its existing endpoint or approved HTTPS
proxy path; never substitute another product's connection values.
Remote origins must use HTTPS. Plain HTTP is accepted only for independently
owned loopback test services. Userinfo, query and fragment routing are rejected.

Public/anonymous credentials are rejected so permission-filtered listings do not
masquerade as complete snapshots. New server secret keys and legacy
service-role credential shapes are supported. A legacy project claim must match
the canonical Supabase host when that binding can be derived. These shape
checks are not signature/authentication proof: the provider must authenticate
each request, and the operator must establish genuine ownership/privileges.

Supply credentials through the approved private configuration process, never
inline in command arguments or in a committed environment file.

```sh
bun run backup:storage
bun --no-env-file run verify:storage "<absolute-snapshot-directory>"
```

The backup also accepts an explicit output parent when invoked directly.
Package commands execute from `backend/`, so use the printed absolute snapshot
path for offline verification.

## Snapshot and verification contract

Each completed `storage-dreamlux-erp-...` directory contains:

- `manifest.json`: format version, product/source fingerprint, selected bucket,
  original keys, observed identity/version/content-type metadata, byte counts
  and SHA-256 checksums.
- `objects/<key-hash>.bin`: the exact original bytes, with physical filenames
  derived from bucket/key hashes rather than untrusted remote paths.

This supports case-only names, Windows-reserved names, Unicode/reserved URL
characters and an object sharing a name with a virtual folder. Empty buckets
and zero-byte objects are valid; a nonexistent bucket is not an empty bucket.
Bucket identities are checked before and after pagination.

All pages of every prefix are enumerated. Object bytes stream to private
staging storage. Listing/download/size/source-change errors abort publication;
they are never logged and skipped followed by a completion message. Prior
snapshots are not overwritten. A second inventory comparison detects ordinary
source additions, deletions and observed version changes during the run.

The offline verifier rejects the wrong product, invalid/duplicate key mappings,
symlinks, missing or unlisted files, unexpected sizes and checksum mismatches.
It uses no provider credentials. Manifests are limited to 16 MiB; checksums are
corruption evidence, not signatures against a maliciously rewritten manifest.

Requests are bounded to 30 seconds. The command has a three-minute budget;
the shared engine permits no more than five minutes. Use private output
directory ACLs; Unix files/directories are created as `0600`/`0700`. Abrupt
process or host loss can interrupt cleanup, requiring inspection of only that
run's owned `.storage-stage-*` directory.

## Evidence boundaries

`bun --no-env-file run test:storage` drives the actual SDK and both CLI entrypoints
against owned synthetic HTTP fixtures. The original CLI lost 103 of 302
objects and exited successfully after a download failure; these are preserved
failing-before regressions with a passing single-object control.
The shared implementation is source-portable with Koti, not a shared endpoint,
database, credentials or runtime dependency.

Tests reuse the existing three-minute backend job and package installation.
They add no runner, retry or larger job cap. The ordinary offline test guard
removes Storage HTTP opt-in variables so native checks cannot accidentally run
inside its mocked/unit environment.

Synthetic HTTP proof is not live Supabase Storage, real provider policy
verification, RPO/RTO or an atomic database/Storage snapshot. Arrange a suitable
write-quiescence procedure when point-in-time consistency is required.
Before any cloud restore, independently attest the destination, review the
manifest's original keys/content types and restore bucket/policy configuration
through an authorized procedure. This command never uploads or changes
production objects.
