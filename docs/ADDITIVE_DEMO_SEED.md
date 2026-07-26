# Additive demo seed

The `dreamlux-demo-2026q3-v1` dataset adds a deterministic, cross-module demo scenario without deleting or updating existing business data. It owns only the fixed UUIDs declared in `backend/src/lib/seed-demo-additive-core.ts`.

## Safety workflow

Run every command from the repository root. The default command is read-only:

```fish
bun run seed:demo:additive
```

Review the printed database identity, catalog values, table counts, and every manifest row. Missing schema objects cause the dry-run to fail; do not apply a migration unless a read-only schema comparison proves a real parity gap.

Applying or cleaning requires copying the exact target token printed by dry-run:

```fish
bun run seed:demo:additive -- --apply --confirm-target=<database>@<host:port>
bun run seed:demo:additive -- --verify
```

After a successful apply, run apply a second time with the same confirmation token. It must report `0` inserted rows, and verify must pass. Applying is transactional and rolls back if its in-transaction verification fails.

Cleanup is destructive and must not be run without separate authorization:

```fish
bun run seed:demo:additive -- --cleanup --confirm-target=<database>@<host:port>
```

Cleanup deletes only the deterministic seed-owned rows. It never truncates tables or deletes rows by a broad text prefix.

## Required catalogs

The seed does not create or modify shared catalogs. Apply fails unless both `Bole HQ` and `Haya Arat` stores, the `Wedding`, `Corporate Event`, and `Photo Shoot` event types, all four service scope codes (`FULL`, `BACKGROUND`, `SETUP`, `TABLE_SETUP`), and an `admin` or `ceo` user already exist.

Do not paste database URLs, passwords, service-role keys, or confirmation tokens containing credentials into tickets or logs.
