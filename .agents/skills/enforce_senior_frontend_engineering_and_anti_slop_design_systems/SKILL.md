---
name: enforce_senior_frontend_engineering_and_anti_slop_design_systems
description: "Executes continuously during any UI architecture design, layout styling, React/Next.js/React Native component creation, or design system refactoring task. Triggers on: new component creation, page layout work, design system tokens, responsive styling, typography hierarchy, iconography, color system decisions, mobile-viewport touch architecture, and any UI update or refactoring that touches visual output."
---

# Senior Frontend Engineering & Anti-Slop Design Systems

This skill defines non-negotiable engineering and visual standards for all frontend work in this project. Every rule below is active on **any task that touches UI output** — new screens, component edits, design system changes, and refactors alike.

---

## Read Before Proceeding

1. Read at least one representative component or page file to understand the current design system before writing new code.
2. If `DESIGN.md` exists in the project root, read it. Prefer its token naming and visual conventions.
3. Run the `impeccable` skill's `context.mjs` if you are also executing a full UI build (`$impeccable craft` / `$impeccable shape`).
4. Every rule group below applies unconditionally. "Out of scope" is not a valid reason to skip a group.

---

## When to Use the `impeccable` Skill Alongside This Skill

The `impeccable` skill (`.agents/skills/impeccable/SKILL.md`) is a full-featured UI craft system with commands like `craft`, `shape`, `audit`, `polish`, `bolder`, `typeset`, and `layout`. It is powerful and comprehensive. Use it **wisely** — not reflexively.

### Use `impeccable` when

- You are **building a new feature surface from scratch** (a full page, a complex multi-step form, an entirely new module) and need architectural UX planning before writing any code — invoke `$impeccable shape [feature]`.
- You are **conducting a formal audit** of an existing page for contrast, responsiveness, motion, or information architecture defects — invoke `$impeccable audit [page or component]`.
- You are **polishing a surface before shipping** (final quality pass) — invoke `$impeccable polish [target]`.
- You are **unsure how to approach a significant visual redesign** — run `$impeccable` with no argument to get a context-aware recommendation.

### Do NOT use `impeccable` when

- You are making a **small, scoped UI change** (fix a label, adjust spacing, correct a color token, add a missing icon). Apply this skill's rules directly and ship the change — don't bloat small PRs with a full impeccable setup run.
- You are doing **backend-only work** with minor UI-adjacent changes (e.g. wiring a new API response to an existing table). Apply this skill's checklist only to the parts you touch.
- You have **already run impeccable context** in this conversation. Do not re-run `context.mjs` — the output is session-cached.
- `impeccable` would **override DreamLux's established design tokens** (gold `oklch(78% 0.12 82)`, obsidian `#050506`, slate palette). Impeccable's palette generator (`palette.mjs`) must be skipped — committed brand tokens already exist in `globals.css`.

### Precedence rule

This skill's rules (Groups A–F) are **always active** regardless of whether `impeccable` is also loaded. If `impeccable` produces a recommendation that conflicts with the rules in this skill (e.g. it suggests `background-clip: text`, or large blur shadows, or excessive radius), **this skill wins**. DreamLux's product register is enterprise/operational — follow the hard bans in Group B without exception.

### Project-specific icon system note

The codebase currently uses `react-icons/hi2` (Heroicons v2 via react-icons) in several components. This is **acceptable** as an alternative to `lucide-react` for this project — both packages are approved. Do not mix both in the same component file. Prefer `lucide-react` for all **new** components; use `react-icons/hi2` only in files that already import it, to maintain consistency. Never dump raw SVG paths.

---

## GROUP A — Quantitative Dominance & Typographic Hierarchy

**The goal**: a senior engineer's data interface is read by the eye in under 300 ms. Metrics land first. Labels are satellite text.

### A1 · Metric-First Visual Anchoring

**Rule**: Prioritize raw quantitative metrics over semantic title or metadata labels as the primary visual anchor of any data surface.

**Action**:
- Format numerical values significantly larger than their surrounding context labels. Target range: `32px–48px` bold, `font-weight: 700–900`, `letter-spacing: -0.02em` (`tracking-tight`).
- Apply `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`) on **every** metric that updates from a live data source. This prevents layout shift ("numerical jitter") caused by variable-width digit glyphs during re-renders.
- For monospace metric contexts (terminals, log panels, financial tickers), use `font-mono` paired with `tabular-nums`.
- Never let a label compete in visual weight with its paired metric. If they read as equals, the label is too large or the metric is too small.

**Extended rationale**: Human peripheral vision resolves contrast and size differentials before the fovea focuses. A metric at `48px/700` against a label at `12px/400` creates a two-stop visual hierarchy that eye-tracks resolve in under 200 ms. Flat hierarchies — metric and label at similar sizes — force the reader to parse semantics instead of scanning structure. On dashboards where users check status across 6–12 cards, this cost compounds per card.

**Implementation checklist**:
- [ ] `tabular-nums` on every numeric field that is data-bound or SSR-hydrated
- [ ] Metric font-size is at least 2.5× the label font-size
- [ ] `letter-spacing` tightened on display metrics (`-0.02em` minimum, `-0.04em` maximum floor — do not go tighter)
- [ ] No `font-weight: 400` on any primary metric

---

### A2 · Label De-Emphasis & Proximity

**Rule**: Compress and mute description labels to force instant data focus.

**Action**:
- Position modifying titles or contextual tags **directly below** the metric using a tight gap of `2px–4px` (not a full `gap-2` or `gap-4`).
- Label sizing: `11px–12px`. Weight: `font-medium` (500). Color: secondary/muted token (`text-neutral-400`, `text-muted-foreground`, or `var(--text-muted)`).
- Never render a label and its metric at equal spatial distance from other sibling elements — this creates false visual equivalence.
- Never add padding between the metric and its label beyond `4px`. They are a single semantic unit.

**Extended rationale**: Proximity encodes relationship. A label 16px below a metric reads as separate metadata. A label 3px below reads as a unit caption. The distinction sounds minor in isolation but produces dramatically different scan paths on dense dashboards. Muted color reinforces the hierarchy set by size — the label is context, not content.

**Implementation checklist**:
- [ ] Label immediately follows metric in DOM order (for screen readers)
- [ ] Gap between metric and label: `2px–4px` only
- [ ] Label opacity or color is visually secondary (fails if it reads at equivalent contrast to the metric)
- [ ] Label `line-height` is tight: `1.2` maximum

---

### A3 · Tabular & Functional Data Density

**Rule**: Eradicate raw narrative prose or loose lists for structured data presentation.

**Action**:
- Flatten complex objects into precise alignment grids or high-density layout panels. Use CSS Grid with named columns for tabular data — never a list of `<div>` pairs or description lists styled to approximate a table.
- Maximize scannability by binding contextual labels directly into the data matrix (column headers, inline unit suffixes like `$`, `ms`, `%`, `kb/s`).
- Eliminate empty or purely decorative whitespace from data panels. Padding inside cells: `8px–12px` vertical, `12px–16px` horizontal — no more.
- Apply `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on cells whose content is variable-length. Never allow text to wrap inside a data row and break alignment.

**Extended rationale**: Prose is the lowest-density presentation format. A sentence saying "The event has 247 confirmed attendees, 18 pending, and 3 cancelled" requires 3 cognitive steps: parse sentence, extract numbers, map to categories. A table row `247 | 18 | 3` under headers `Confirmed | Pending | Cancelled` requires zero — the structure IS the semantics. Prefer structure-as-meaning over prose-as-meaning on every data surface.

---

## GROUP B — Iconography, Asset Hygiene & Anti-Slop Primitives

### B1 · Strict Icon Package Enforcement

**Rule**: Ban all generic UI emojis, raw inline SVG dumps, and un-optimized asset injections inside component files.

**Action**:
- Import explicit vector assets **exclusively** from modern, standardized, tree-shakeable icon packages:
  - `lucide-react` (preferred for this project — consistent 24px grid, 1.5px stroke weight)
  - `@heroicons/react` (acceptable alternative)
  - `@phosphor-icons/react` (acceptable for richer variants)
- Wrap every icon in a sizing and color class: `<Icon className="size-4 text-muted-foreground" />`. Never use raw `width`/`height` HTML attributes.
- Never paste multi-line raw SVG paths (more than 3 `<path>` elements) directly inside a layout component file. Extract to a dedicated `/icons` or `/assets` directory, or use the icon package.
- Emoji usage: prohibited in UI chrome (navigation, buttons, data cells, badges). Acceptable only in user-generated content display where the emoji is part of the data itself.

**Extended rationale**: Raw SVG dumps inside component files create three compounding problems: (1) they are never optimized (redundant attributes, non-minimal paths), (2) they break visual consistency because they don't share the project's stroke weight, viewBox, or color system, (3) they bloat the component file, making it harder to review and maintain. A `lucide-react` import is one line, treeshakeable, consistent, and directly colorable via CSS `currentColor`.

---

### B2 · Zero Decorative Slop

**Rule**: Absolute prohibition of ambient "AI Slop" styling gimmicks used to suggest polish without delivering structure.

**Action — banned patterns**:
- **Floating background gradients**: radial or conic gradients applied as decorative background blobs, glow spots, or ambient color fills behind content areas. These mask poor layout with noise.
- **Un-aliased shadows**: `box-shadow` with blur radius ≥ 16px used as the primary separation between elements. Maximum permitted blur for structural shadows: `8px`. Use `1px solid` borders instead.
- **Glassmorphism by default**: `backdrop-filter: blur()` applied broadly to cards, panels, or navigation without a concrete legibility justification. Permitted only when content behind the blurred surface is explicitly part of the design intent (e.g., a modal over a visible background image).
- **Gradient text** (`background-clip: text`): decorative, not semantic. Replace with solid color. Emphasis via weight or size only.
- **Identical card grids**: same-sized cards repeating icon + heading + body across an entire section. Rewrite using varied hierarchy or a table.
- **Tiny uppercase tracked eyebrows** above every section heading. One deliberate eyebrow as a brand system element is permitted; an eyebrow on every section is AI grammar.

**Enforce visual structure using**:
- Sharp, single-pixel crisp solid borders: `border border-neutral-800` (dark mode) / `border border-neutral-200` (light mode)
- Absolute dark backgrounds: `bg-black`, `bg-neutral-950`, `bg-slate-950`
- High-contrast separation: background color contrast between adjacent surfaces, not shadow

---

## GROUP C — Clutter Management, Color Tokens & Redundancy Reduction

### C1 · Absolute Input Minimization

**Rule**: Avoid forcing manual keyboard text entry for predictable, enumerable user operations.

**Action**:
- Audit every `<input type="text">` in the design. If the domain of valid values is finite and knowable in advance, replace with:
  - Segmented control / tab bar for 2–5 mutually exclusive options
  - Token/badge selector cards for multi-select enumerable values
  - Combobox with static options list (not free-text) for 6–20 options
  - Slider with snapping for continuous numeric ranges with known bounds
- Reserve free-text inputs for: search queries, names, addresses, open-ended notes, and fields where the value set is genuinely unbounded.
- Never use a text input as a workaround for an absent UI component. Build the component.

**Extended rationale**: Every free-text field introduces three failure modes: misspelling, invalid value, and unclear affordance. Every tap-to-select interaction eliminates all three. The friction reduction is not cosmetic — it directly increases form completion rates and data quality. On mobile, keyboard invocation is an especially high-cost interaction; minimizing it is a UX performance optimization.

---

### C2 · Strict 90/10 Color Distribution

**Rule**: Limit high-saturation branding accents to crucial interactive destinations.

**Action**:
- **90% of surface area**: structural neutrals — deep charcoal (`neutral-900`), pitch blacks (`neutral-950`, `black`), precise cool grays (`neutral-700`–`neutral-800` for borders/separators, `neutral-500`–`neutral-600` for secondary text).
- **10% of surface area**: vivid accent color tokens — reserved exclusively for:
  - Primary call-to-action buttons (one per view)
  - Active/selected state indicators
  - Critical system warnings or error badges
  - Key status indicators (event live, booking confirmed, payment overdue)
- **Gold accent (`#D4AF37` or equivalent OKLCH)** for this project: follows the same 90/10 rule. Gold is a signal color, not a background color. Never fill a card or panel surface with gold.
- Verify at build time: if more than two elements per viewport use the accent color, one of them is wrong.

**Extended rationale**: Saturation hierarchy is the color equivalent of typographic weight. When everything is accented, nothing is. The 90/10 split is not arbitrary — it matches the signal-to-noise ratio required for an accent to function as an attention directive. A design where gold appears on headers, borders, icons, buttons, and badges simultaneously has destroyed the signal value of gold.

---

### C3 · Elimination of Structural Redundancy

**Rule**: Eradicate double-labeling, repeating descriptions, and context text that the structure already communicates.

**Action**:
- If a column header, card title, or section label already establishes context, never add a helper string below it restating the same information.
- Let data units embedded in values (`$4,200`, `247 guests`, `98.4%`, `142 ms`) communicate meaning. Never add a separate label line saying "Total Revenue" under a value that already lives in a "Revenue" column.
- Apply this audit: for every label on the screen, ask "what does the reader lose if I remove this?" If the answer is "nothing, because the structure already says it," remove it.
- Exception: accessibility — when a visual label is removed, ensure the equivalent is present as `aria-label` on the containing element.

---

## GROUP D — Native Mobile App Interaction (React Native / Expo)

> These rules apply only when the target platform is React Native, Expo, or a native mobile wrapper.

### D1 · Interruptible Gesture & Spring Physics

**Rule**: Enforce physical, interruptible spring physics on all touch targets.

**Action**:
- Bind press states to interruptible spring animation models. Use `react-native-reanimated` with `withSpring` for scale transforms on press:
  ```ts
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const gesture = Gesture.Tap()
    .onBegin(() => { scale.value = withSpring(0.96, { mass: 0.5, stiffness: 300 }); })
    .onFinalize(() => { scale.value = withSpring(1); });
  ```
- Touch targets must listen for parent scroll events or drag-away flags via `simultaneousHandlers` / `waitFor` from `react-native-gesture-handler`. If the user begins scrolling mid-press, the press state must cancel and the element must animate back to rest immediately.
- Never use `TouchableOpacity` for complex interactive elements — it has no gesture cancellation mechanism. Use `GestureDetector` from `react-native-gesture-handler`.

**Extended rationale**: iOS and Android's native UI kits implement spring physics on every interactive element. Users are calibrated to expect physical response. A flat opacity flash (the `TouchableOpacity` default) reads as technically inferior and breaks trust on premium interfaces. Interruptibility is equally critical: a press that cannot be cancelled when the user changes their mind is an interaction that feels "stuck" — a major source of mobile UX frustration.

---

### D2 · Hardware Haptic Alignment

**Rule**: Sync viewport state transitions with device haptic physical responses.

**Action**:
- Use `expo-haptics` (`Haptics.impactAsync`) on:
  - `ImpactFeedbackStyle.Light`: tab selection, chip/filter toggle, minor state changes
  - `ImpactFeedbackStyle.Medium`: primary button confirmation, form submission, list item selection
  - `ImpactFeedbackStyle.Heavy`: destructive action confirmation, payment success, critical error
  - `Haptics.notificationAsync(NotificationFeedbackType.Success/Error/Warning)`: async operation result arrival
- Slider snaps: fire `Light` haptic on each discrete snap position.
- Never fire haptics on every re-render, scroll event, or animation frame — haptics are semantic events, not animation callbacks.
- Respect `AccessibilityInfo.isReduceMotionEnabled()` — when true, reduce haptic intensity or disable non-critical haptics.

---

### D3 · Pre-Prompt Permission Orchestration

**Rule**: Never initiate raw, unannounced native OS access requests.

**Action**:
- Intercept every permission request (Camera, Files/Photos, Location, Contacts, Push Notifications, Microphone) behind a custom "feature gate" screen that:
  1. Names the feature unlocked by the permission (not the permission itself)
  2. Shows a concrete visual example or icon of what the feature does
  3. Presents an explicit "Enable [Feature Name]" primary action and a "Not Now" secondary action
  4. Invokes the native OS permission prompt only after the user taps the primary action
- Never call `requestPermissionsAsync()` in a `useEffect` on mount. Always lazy-invoke on explicit user intent.
- If the user denies, never re-prompt on the same session. Show a settings-deep-link instead.

---

## GROUP E — Responsive Web Architecture (Next.js / Tailwind)

> These rules apply to Tailwind CSS / React / Next.js web applications.

### E1 · Web Sticky Hover Isolation

**Rule**: Isolate mouse-over states so they never pollute mobile touchscreen viewports.

**Action**:
- All hover styles must be wrapped in `@media (hover: hover) and (pointer: fine)` or the Tailwind equivalent where available.
- In Tailwind v3.3+: use `[@media(hover:hover)]:hover:bg-neutral-900` syntax.
- Never write bare `hover:` utilities on elements that appear on mobile viewports. The touch event system fires `mouseenter` on tap and never fires `mouseleave` on tap-away — causing states to stick.
- For dropdown menus and tooltips: use `mouseenter`/`mouseleave` event listeners guarded by the same `matchMedia('(hover: hover)')` check, or use the Popover API which handles this natively.

---

### E2 · Content Layout Shift (CLS) Hard Containment

**Rule**: Zero visual frame jumping or content shifting during asynchronous mutations or SSR hydration.

**Action**:
- Lock aspect ratios on every media slot before content loads: `aspect-video` (16:9), `aspect-square`, or an explicit `aspect-[W/H]` matching the incoming content's intrinsic ratio.
- Skeleton loaders must match the **exact** dimensions of the content they replace — same height, same grid position, same padding. A skeleton that is 10px shorter than the real content causes a CLS event on swap.
- For SSR: pre-render skeleton markup at the correct dimensions on the server. Never render `null` for async data on the server and then mount the real element on the client — this guarantees CLS.
- Numeric counters animating from 0 to N: use `tabular-nums` and pre-allocate width with `min-w-[Xch]` matching the maximum expected digit count.
- Google's CLS threshold: < 0.1. Treat > 0.05 as a regression.

---

### E3 · Fluid Grid Safety Boundaries

**Rule**: Prevent grid collapse, overlap, or line clipping on non-standard breakdown widths.

**Action**:
- Default responsive grid pattern: `grid-cols-[repeat(auto-fit,minmax(280px,1fr))]` — this reflows without explicit breakpoints.
- For layouts with a known minimum column count, add `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` as a fallback alongside auto-fit.
- Test at the "in-between" widths (375px, 430px, 768px, 1024px, 1280px, 1440px, 1920px) — these are where auto-fit grid collapse usually fails.
- Text truncation in grid cells: always pair `min-w-0` with the flex/grid child when using `truncate` — without `min-w-0`, flex children do not truncate and overflow their container.
- Never use `vw`-based font sizes without `clamp()`. Raw `vw` creates unreadably large text on wide viewports and unreadably small text on narrow ones.

---

## GROUP F — Mobile-Viewport Touch Architecture (< 768px Width)

> Enforced for both responsive web mobile viewports and native handheld screens.

### F1 · Lower-Third Reachability Prioritization

**Rule**: Map primary high-frequency interactive triggers into the natural thumb zone.

**Action**:
- The natural thumb zone for a right-handed one-handed grip covers roughly the lower 35–45% of the screen height and the right 70% of the width.
- Position in the lower 33–40% of the viewport:
  - Primary action buttons (Book, Confirm, Pay, Submit)
  - Global filter menus
  - Destructive action confirmations
  - Checkout flow next-step controls
- Abolish top-corner burger menus or header-nested actions for core user behaviors. Navigation that users access more than once per session must be within thumb reach.
- On native: use `SafeAreaProvider` from `react-native-safe-area-context` and place primary actions inside the safe-area-aware bottom padding.

---

### F2 · Tap Footprint & Fat-Finger Padding

**Rule**: Enforce minimum safe collision boxes for accurate finger tracking.

**Action**:
- Minimum touch target: **48×48px** for every actionable element (matches Apple HIG and Material Design minimums). For secondary/destructive actions: **44×44px** absolute floor.
- Adjacent interactive elements: minimum **8px gap** between outer edges. Closer than 8px causes measurable mis-tap rates.
- When a visible element is smaller than 48px (e.g., a 16px icon button), extend the tap area using padding or a transparent hit-area wrapper — never scale the visible icon up to 48px.
- Audit tap targets using browser DevTools "paint flashing" or Expo's `onPress` debug logging to verify coverage.

---

### F3 · Modern Bottom Sheet Orchestration

**Rule**: Replace intrusive full-screen center-layout alerts and modals with progressive bottom sheets.

**Action**:
- Route the following content types into bottom-anchored, swipe-dismissible sheets:
  - Detail panels (event details, booking breakdown, guest profile)
  - Complex form options (filter configuration, date range pickers, multi-step selections)
  - Confirmation dialogs for non-critical operations
  - Settings sub-panels
- Bottom sheet implementation requirements:
  - Swipe-down gesture dismisses the sheet (native feel)
  - Tap on the backdrop dismisses the sheet
  - Sheet must not cover the full viewport unless the content genuinely requires it (full-screen sheets are for multi-step forms only)
  - Include a visible drag handle indicator (centered 32×4px pill, `rounded-full`, muted color)
- For web: use `vaul` (Drawer component by Emil Kowalski) or a CSS-only bottom-anchored sheet with `transform: translateY` spring transition.
- For React Native: use `@gorhom/bottom-sheet` with `snapPoints`.
- Never use `Alert.alert()` or browser `alert()`/`confirm()` for product UX. These are debug tools only.

---

## Verification Checklist (Run Before Completing Any UI Task)

Before marking a UI task complete, verify:

- [ ] **A1**: Every data metric uses `tabular-nums` and is visually larger than its label by ≥ 2.5×
- [ ] **A2**: Label gap from metric is ≤ 4px; label is `11–12px`, muted color
- [ ] **B1**: No raw multi-line SVG dumps in component files; icons from `lucide-react` or approved package
- [ ] **B2**: No floating gradient blobs, no `box-shadow` blur > 8px as primary separator, no `background-clip: text` gradients
- [ ] **C2**: Accent color appears on ≤ 2 elements per viewport; 90%+ of surface is neutral
- [ ] **C3**: No label restates what the structural context already communicates
- [ ] **E1**: All `hover:` styles are guarded by `@media (hover: hover)` or equivalent
- [ ] **E2**: Every media/async slot has a locked aspect ratio or skeleton of exact matching dimensions
- [ ] **E3**: Grid tested at 375px, 768px, 1280px — no overflow, no collapse
- [ ] **F1**: Primary actions are in the lower 40% of the mobile viewport
- [ ] **F2**: All touch targets ≥ 48×48px with ≥ 8px separation
- [ ] **F3**: No `Alert.alert()` / browser `alert()` / centered blocking modals for product UX — use bottom sheets
- [ ] **WCAG**: Body text ≥ 4.5:1 contrast ratio; large text ≥ 3:1; placeholder text ≥ 4.5:1
- [ ] **Viewport**: Checked at 320px, 375px, 768px, 1280px, 1920px widths
