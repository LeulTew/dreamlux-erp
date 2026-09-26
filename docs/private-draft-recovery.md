# Private Event and Employee draft recovery

The Event list/editor, Employee list/editor, and existing Employee-create page
opt into one private draft boundary. This is an in-memory continuity mechanism,
not an authorization source, persisted draft store, or application-wide recovery
manager. Other pages keep their existing lifecycles.

## Authority and ownership

- `/auth/me` and `/auth/permissions` remain the only authority endpoints. The
  frontend accepts the existing minimal identity response; profile fields and a
  full database `User` record are not required.
- Permissions are bound to the principal and a client-cache verification
  revision. Every successful identity recheck requires a new matching permission
  response before private requests or callbacks resume. The revision is neither
  a server claim nor a local-storage field.
- Readiness additionally requires a receipt from the current canonical Query
  instance: an observed fetch, execution of its bound request function, and a
  non-manual successful completion of that same fetch promise. Query status,
  timestamps, data counters and restored cached success are not proof. Manual
  cache changes, cancellation and retired query instances revoke the receipt;
  a paused query that never executes its request cannot create one. Permission
  receipts bind to the accepted identity receipt, and retry remains identity-first.
- Pending identity/permission verification, lookup errors, malformed authority,
  and mismatched `user_id` cannot authorize from cached grants. Role previews
  remain intersections with current explicit grants.
- Fresh, successfully verified empty grants are forbidden, not an availability
  error. Actual grant revocation or a principal change retires the old owner.
- Retention also captures the verified `/auth/me` primary role and effective
  role set. Reordering or repeating roles does not change that identity. A fresh
  role-identity change retires the owner and queued callbacks even when actor
  and permission slugs are unchanged: backend field redaction can depend on
  roles independently of those slugs. Roles are never used to grant access here.
- Continuity retention requires a stable server identity. Supported ID-less
  bootstrap sessions retain their existing authorized normal behavior, but their
  drafts are not retained across an unverifiable recheck. A null ID is not
  promoted to a shared anonymous principal.

## Private hold and recovery

An already-authorized, stable-identified owner can survive a same-principal
recheck or temporary service error. Its page state, field values, selected
record, files, previews, dates, scopes, and employee price JSON remain in memory.
Its DOM region is hidden and inert. The actual editor, delete, activity, and
header portals close through their existing open-state contracts, so hiding a
parent region is not incorrectly assumed to hide body-portaled content.

Only the recovery surface is interactive while held. A completed availability
failure exposes **Retry access**; that action verifies identity and current
permissions, not the business mutation. Cold entry does not mount private
children. Public login is outside this opt-in boundary and gains no private auth
queries. `Providers` is unchanged.

The Employee page's outer permission branch preserves the owned inner component
only during a temporary private hold. The Event page uses the same authority
contract rather than its former independent `auth-permissions` query.

The real page entry is keyed to its pathname and route `edit` identity; changing
that identity retires the page owner even if a legacy editor-selection effect
still holds its previous record. Switching the selected record also retires its
editor consumer. A different
principal, confirmed logout/401, or actual grant revocation cannot resurrect the
old draft. Logout intent stops private admission immediately, before waiting for
the existing logout request and storage/cache cleanup.

## Request and acknowledgement behavior

The boundary installs a private Axios admission guard only for its lifetime.
Auth verification/login/logout endpoints remain outside that guard. Admission is
checked against live query state at the adapter boundary, including a request
that was queued while access was valid but has not yet reached the wire.

Owned domain queries carry an owner-lifetime key. Explicit request bindings also
reject a retired principal/record consumer. Permission-specific writes use the
current permission predicate, independently of whether a button is visible.

A business write already admitted to the wire is not aborted or automatically
replayed by recovery. Its acknowledgement settles once; UI callbacks wait
privately for the same eligible owner or are discarded after retirement. An old
principal or record cannot update the new owner's UI, toast, or focus.

List-preference debounce and unmount flush use the live owner at admission.
Normal authorized navigation still flushes pending preferences. Checking,
unavailability, retirement, and logout intent do not flush them under stale
authority. Preference storage keys and payload shapes are unchanged.

React StrictMode effect replay temporarily blocks admission during detach, but
does not destroy a reattached owner. A real detach remains blocked immediately;
deferred final disposal cannot admit requests or invoke stale callbacks.

## Verification boundary

Focused component tests exercise the actual Event and Employee editors and
their page gates with minimal synthetic identity/permission records and an
in-process Axios adapter. Coverage includes private pending/503 recovery,
current permission rebinding, record/principal/grant changes, ID-less behavior,
public/cold entry, files/previews, preferences, queued admission, terminal
logout/401, StrictMode, and late acknowledgements.

These are source/component and adapter-boundary checks, not production
authentication, native HTTP persistence, native assistive-technology, or live
browser certification. The existing backend current-grant/JWT/bootstrap policy,
finance transactions, upload hardening, and shared Select/Drawer geometry are
unchanged by this feature.
