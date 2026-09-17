# Employee compensation modes

Issue #195 defines compensation independently from scheduling fields such as `employment_type`.

- `regular`: base salary from the active salary level (falling back to the employee base salary) plus eligible event commission.
- `commission_only`: zero base salary plus eligible event commission.

Existing employees deliberately migrate to `regular`, preserving current payroll behavior. Every payroll employee line snapshots the applied compensation mode, base salary, commission total, and final total so later employee changes cannot rewrite history.

Employee PATCH preserves omitted department, office and salary-code fields.
An explicitly supplied, validated blank string still clears that field; it is
not equivalent to omission. This applies to JSON and multipart requests, so a
single-field Quick Edit cannot erase unrelated employee setup.
The shared correction matches LeulTew/koti-catering#262 / LeulTew/koti-catering#263,
without changing DreamLux's salary code/FK policy, compensation calculation,
compatibility retries or historical payroll snapshots.

Staff-payment employee selection uses the existing `active` (non-trashed) list
contract, not an employment-eligibility or compensation filter. The picker
searches the server in 50-row pages ordered by name and unique employee code;
ordinary directory calls retain their default salary ordering. Saved and newly
selected links remain visible across searches, pages and lookup failures.
Loading, empty and failed lookups are distinct, with a deliberate retry and a
10-second request timeout. The positional API arguments remain unchanged; an
optional final request-options argument supplies cancellation and timeout only.
This adapts LeulTew/koti-catering#268 / LeulTew/koti-catering#277 for Dream #232
without changing finance payloads, permissions, month closure or payroll guards.

Event commission is eligible only for verified work/attendance. `GET /payroll/eligible-commissions` groups attended assignments by employee and event type for the requested payroll dates, counting each event once and summing its recorded commission. Preview, draft, and finalize rebuild these lines server-side from the same query; client-submitted commission values are not authoritative. Corrections are made on the event assignment, preserving one audited source of truth. Unchecked attendance is excluded.

Event completion records attended commission as the event's labor expense. Payroll snapshots the same earned commission as an employee liability/payment, but the monthly net-profit statement deducts only payroll base-salary snapshots because event commissions are already included in approved event labor expenses. This prevents the same commission from reducing profit twice.
