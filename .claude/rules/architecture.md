# Codebase System Architecture Rules

These rules apply when designing modules, structuring directories, writing service logic, or importing dependencies.

---

## 1. Clean Architecture Boundaries
- **Layer Separation**: Keep infrastructure code, database/data access layers, business/domain logic, and UI presentation components strictly separated into distinct modules.
- **Service Abstraction**: Place API clients, storage adapters, and external third-party integrations behind explicit service boundaries or interface layers. Do not reference raw external clients directly inside your presentation views.

---

## 2. Dependency Management
- **No Redundant Packages**: Do not add new dependencies to `package.json` until you have verified that the repository contains no suitable existing option. Maximize reuse of existing utility functions.

---

## 3. Error Handling Principles
- **No Swallowed Exceptions**: Never catch and swallow errors silently. 
- **Error Trace Context**: Boundary errors must be logged with rich trace contexts (e.g. request parameters, user ID, trace identifiers) and bubbled up or surfaced through a defined user-facing error response path.
