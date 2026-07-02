# Database Integrity, Postgres & Supabase Rules

These rules apply when writing database schema changes, DDL migrations, writing backend query controllers, or using Supabase APIs.

---

## 1. Remote Database Schema Synchronization
- **Migration Application**: Any task introducing database structure modifications (SQL/DDL changes, new tables, or new columns) MUST have its matching migration applied directly to the remote Supabase database (e.g., using Supabase MCP tools like `apply_migration` or the Supabase CLI) during the implementation/deployment phase, and verified before concluding the task. 
- **Production Parity**: Never leave the remote production database schema out of sync with the codebase.

---

## 2. Code Quality & Query Efficiency
- **NO DATABASE QUERIES IN LOOPS**: Never perform database queries (including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, or Prisma/Supabase client calls) inside iterative loops (e.g., `.map()`, `.forEach()`, `for...of`, `while`). 
- **Bulk Operations**: Always batch queries, use Postgres `JOIN` statements, or execute single-query bulk operations to minimize database round-trips and connection pool exhaustion.
- **Explain Analyze**: For complex queries, check execution plans (using `EXPLAIN ANALYZE`) to ensure indexes are utilized properly.

---

## 3. Security & Access Boundaries (BOLA / BFLA)
- **Role-Based Authorization (BFLA)**: Verify that the caller's role has explicit permissions to perform the requested operation (create/read/update/delete) before invoking queries.
- **Ownership Validation (BOLA)**: Always scope queries by tenant ID or user/driver ID to prevent cross-account data leakage. Never retrieve records without validating ownership filters.

---

## 4. Transaction Integrity & Rollbacks
- **Transactional Wrapping**: Wrap multi-step data mutations that span multiple tables or records in a transaction block.
- **Rollback Discipline**: If any sub-operation, constraint check, or audit logging fails, roll back the entire transaction to prevent orphan records or inconsistent data states.
