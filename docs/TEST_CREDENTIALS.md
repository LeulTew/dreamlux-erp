# 🔑 Dream Lux ERP Test Credentials & RBAC Matrix

Use the following user credentials to test the various Role-Based Access Control (RBAC) permissions across the application.

## 👥 Seeded User Accounts

> [!NOTE]
> The default password for all seeded test accounts is **`Password123`** (case-sensitive).

| Username | Role | Full Name | Associated Email | Scope / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`ceo`** | `OWNER` | Dream Lux CEO | `owner@dreamlux.com` | Full system access, all reports, payroll, and event locks overrides. |
| **`ops`** | `OPS_MANAGER` | Operations Manager | `ops@dreamlux.com` | Operational setup, task checklists, crew scheduling, and logistics. (No financial visibility). |
| **`acc`** | `ACCOUNTANT` | Senior Accountant | `accountant@dreamlux.com` | Expense approvals, profit dashboards, and payroll runs. |
| **`eventmgr`** | `EVENT_MANAGER` | Event Manager | `events@dreamlux.com` | Event lifecycle, checklist tasks, and lodging general expenses. |
| **`inv`** | `INVENTORY_OFFICER` | Inventory Officer | `store@dreamlux.com` | Store inventory, recounts, and allocating items to events. |
| **`inventory_user`** | `INVENTORY_CONTROLLER`| Inventory Controller | `inventory.controller@dreamlux.com` | Inventory allocations and recounts (compatible alias role). |
| **`driver`** | `DRIVER` | Selam Bekele (Driver) | `selam@dreamlux.com` | Scoped strictly to viewing assigned events and logging vehicle trips/fuel logs. |
| **`admin`** | `SUPER_ADMIN` | System Administrator | `admin@local.erp` | Full administrative and role configuration access. |

---

## 🛠️ Testing Scenarios

### 1. Driver BOLA and Trip Logging
*   **Action**: Log in as **`driver`** (password `Password123`).
*   **Assigned Driver Mapping**: Mapped to employee **Selam Bekele** (Driver).
*   **Verification**:
    - Try to log a trip for a vehicle assignment assigned to Selam Bekele (e.g. `AA-3-A12345` on *Hana & Daniel Wedding*). The request should **succeed**.
    - Try to log a trip for a vehicle assignment assigned to a different driver. The backend will return `403 Forbidden` (BOLA protection).
    - The `driver` role is blocked from logging arbitrary manual expenses (only trip logs are allowed).

### 2. Operations Manager Financial Isolation
*   **Action**: Log in as **`ops`** (password `Password123`).
*   **Verification**:
    - Load the event details workspace. The **expenses** and **trips** arrays are returned empty to prevent financial data leakage.
    - Try to view single-event profit reports or consolidated dashboards. Access is **denied**.

### 3. Expense Review Gating
*   **Action**: Log in as **`acc`** (password `Password123`).
*   **Verification**:
    - Review pending expenses. The review is audited in the `event_logs` table, and soft-deleted events are blocked from review.
