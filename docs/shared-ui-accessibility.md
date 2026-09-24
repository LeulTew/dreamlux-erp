# Shared shell and selector behavior

Issue #286 adapts shared accessibility behavior to DreamLux's existing
navigation, permissions, language store and visual tokens. It does not change
authentication policy, signing configuration, business records or database
schema. The intentional browser `/api/api/activity` route is unchanged.

## Header and overlays

Search, profile and notification triggers use at least 48px dimensions with 8px
separation. The existing bottom navigation entry remains the mobile navigation
control; the desktop sidebar toggle is not duplicated on mobile. Breadcrumb
names, generated result categories, quantity labels and fallback payroll labels
follow English/Amharic without translating authored records or shortening IDs.

The profile popover and search/About/sign-out dialogs use the existing Radix
modal primitives and `useModalFocus`. Tab stays in the active overlay and Escape
closes only its owner. Ctrl/Cmd+K is consumed while another modal is open without
opening search over it. Keyboard-opened search returns to its original control,
or the surviving search trigger if that control disappeared. Reopening search
starts a new query; keys on other buttons do not select a search result.

The search input is the named combobox controlling a separate result listbox.
Its active descendant follows a stable result key, not a changing array index.
Arrow navigation keeps the active result visible within the results scroller
before Enter opens that result. Native query editing and direct pointer
activation remain available. The input's Escape belongs to the search dialog,
while nested selector Escape remains with the existing modal-focus helper.

Profile settings and search sources retain current permission checks. Already
loaded results are hidden when the corresponding source permission is removed.
About describes the product only: it does not invent database connectivity,
version, build provenance or release identity.
The notification change is limited to its trigger dimensions, generated name
and focus/hover presentation; unread state, polling, delivery and inbox actions
are unchanged.

## Select contract

- A closed or non-searchable Select exposes its trigger as the combobox.
  Opening a searchable Select transfers that role, external label ID and
  active-descendant relationship to the focused input. Exactly one combobox
  owns the separate listbox.
- Active option IDs follow exact option identity, not a filtered array index.
  Arrow navigation skips disabled options. Filtering, removal and disabling
  reconcile the active option without changing the committed value.
  Reordering or changing visible option content also reconciles scroll position
  even when the active option retains the same ID.
- Home/End navigate a select-only list; searchable inputs retain normal text
  editing. Composition and modified shortcuts do not commit a candidate.
  Native option and Add-button activation remain separate.
- Escape closes the selector before a containing drawer. Add and search are
  outside the listbox; Add receives native keyboard activation. Outside focus
  closes without pulling focus back.
- The hidden named form control preserves exact values and is excluded when
  the whole Select is disabled. Disabling closes the list; re-enabling does not
  reopen stale UI. Default generated labels use the existing saved-language
  hook; explicit labels, authored option text and caller classes are retained.

The separate Radix `StaffPaymentEmployeePicker` is not replaced by this Select.
Existing callers' business values and handlers are unchanged.

## Pending drawer ownership

`ResponsiveDrawer` accepts optional `dismissDisabled` and `closeLabel` props.
Existing callers keep their previous unlocked behavior; this change does not
invent new business-policy locks. A caller that already owns a pending write can
explicitly lock dismissal. The close button, Escape, outside dismissal and drag
dismissal then respect that lock, including a lock arriving during an exit.

If the new lock disables the drawer's directly focused control, focus moves to
the active drawer panel without scrolling. Enabled readers, intentionally
blurred controls, nested/sibling dialogs, outside focus and inactive documents
are not claimed. Explicit external closure still wins; callbacks from abandoned
exit cycles must not close a reopened drawer.

## Evidence boundary

### Primary submit targets (#303)

Employee creation and the Event/Employee editor primary submit buttons retain
at least 48px height and width in normal and loading states. Their call-site
`active:scale-100` override prevents a press from shrinking that minimum; the
shared Button defaults and secondary controls are unchanged. Labels, padding,
colors, form association, payloads and success callbacks stay on the same
existing button. This is not a claim that all secondary touch targets meet the
same minimum.

Focused component regressions check the resolved minimum/pressed classes,
normal-to-loading element identity, exact synthetic payloads and one settled
success. Rendered rest/pressed/loading bounds still require a separately
authorized browser build; these source checks do not clear retained mobile
geometry failures or unknown unmarked RSC cancellations.

### Shared behavior

Dedicated Dream component regressions cover the original missing
names/ownership/disabled-focus behavior and retained modal/session controls.
They mock auth, API and provider-adjacent children before component evaluation;
no application database/provider client is required. SSR/hydration coverage
uses synthetic browser storage and records.

Component semantics and CSS minimums are not rendered geometry, touch,
contrast or native-database proof. Parent owns independent review and the
separately authorized real-browser locale/theme/viewport checks, including
48px targets, 8px gaps and 4.5:1 text contrast. No deployment, live-schema
assurance, whole-project quality score or source publication is implied.
