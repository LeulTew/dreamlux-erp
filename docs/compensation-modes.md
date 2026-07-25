# Employee compensation modes

Issue #195 defines compensation independently from scheduling fields such as `employment_type`.

- `regular`: base salary from the active salary level (falling back to the employee base salary) plus eligible event commission.
- `commission_only`: zero base salary plus eligible event commission.

Existing employees deliberately migrate to `regular`, preserving current payroll behavior. Every payroll employee line snapshots the applied compensation mode, base salary, commission total, and final total so later employee changes cannot rewrite history.

Event commission is eligible only for verified work/attendance. `GET /payroll/eligible-commissions` groups attended assignments by employee and event type for the requested payroll dates, counting each event once and summing its recorded commission. Preview, draft, and finalize rebuild these lines server-side from the same query; client-submitted commission values are not authoritative. Corrections are made on the event assignment, preserving one audited source of truth. Unchecked attendance is excluded.

Event completion records attended commission as the event's labor expense. Payroll snapshots the same earned commission as an employee liability/payment, but the monthly net-profit statement deducts only payroll base-salary snapshots because event commissions are already included in approved event labor expenses. This prevents the same commission from reducing profit twice.
