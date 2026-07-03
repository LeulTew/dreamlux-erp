# UI/UX Design System and Rebrand Guidelines

These rules apply when creating new UI components, modifying pages, layouts, styles, design tokens, or icons.

---

## 1. Mandatory Skill Trigger
Before modifying or creating any component, page, stylesheet, or asset, you MUST read and follow the detailed standards in:
`.agents/skills/enforce_senior_frontend_engineering_and_anti_slop_design_systems/SKILL.md`

---

## 2. Color Theme & Gradients
- **Light Mode**: Use clean warm-white backgrounds with polished elegant gold accents (`#D4AF37` or equivalent premium metallic gold HSL variations).
- **Dark Mode**: Use deep charcoal, slate-gray, or dark-purple backdrops, contrasted cleanly with bright gold text/accents.
- **Gradients**: Use smooth, tasteful gradients for headers, main dashboard cards, and hero sections (e.g. `from-slate-900 to-indigo-950` with gold text overlay) to establish a premium luxury feel.
- **Strict 90/10 Distribution**: Construct 90% of the display architecture using high-contrast, structural neutrals. Limit gold and satruated accents to primary destinations. If more than 2 elements per viewport use gold simultaneously, it is a design violation.

---

## 3. Geometric Elements & Borders
- **Border Radius**: Use the global custom curved border radius scale tokens consistently across the entire site to maintain the signature highly curved design language:
  - Default to token-backed classes that map directly to our CSS variables: `rounded-sm` (8px), `rounded-md` (10px), `rounded-lg` / `rounded` (14px), `rounded-xl` (18px), `rounded-2xl` (22px), `rounded-3xl` (26px), and `rounded-4xl` (32px).
  - Banish all arbitrary radius values (e.g., `rounded-[15px]` or `rounded-[5px]`).
  - Keep interactive components, buttons, inputs, and cards aligned to this curved scale consistently, avoiding overly sharp corners.
- **Shadows**: Keep shadows minimal or completely flat. Rely on clean, high-contrast borders (`1px border-border` or `border-gold/20`) to separate components instead of large, blurred shadows.


---

## 4. Contrast & Legibility
- **Contrast Ratios**: Always verify that all text colors, SVGs, and icon fills satisfy standard Web Content Accessibility Guidelines (WCAG) contrast ratios (min 4.5:1 for regular text, min 3:1 for large text).
- **Hovers & Transitions**: Verify that interactive hover and focus states provide strong visual contrast indicators.
- **Web Sticky Hover Isolation**: Isolate mouse-overs to protect mobile touchscreen viewports from sticky element states. Enforce hover actions exclusively behind Tailwind's touch-safe hover modifier (`md:hover:...`) to prevent tooltips or color states from getting stuck on mobile screens when a user taps away.

---

## 5. Mobile Touch UX (< 768px Width)
- **Lower-Third Reachability Prioritization**: Map primary high-frequency interactive triggers directly into the handheld natural thumb zone. Position global filtering menus, confirmation buttons, checkout steps, and destructive actions within the lower 33% to 40% of the viewport area. Abolish the use of top-corner burger menus or header-nested actions for core user behaviors.
- **Tap Footprint and Fat-Finger Padding**: Enforce minimum safe collision boxes for accurate finger tracking. Secure a rigid touch target geometry of at least 48x48px for every actionable element. Isolate adjacent buttons or links with a clear margin boundary (minimum 8px) to insulate operations against double-tap or misclick errors.
- **Modern Bottom Sheet Orchestration**: Replace intrusive full-screen center layout alerts with progressive bottom sheets. Route details, complex form options, and configuration modifications into bottom-anchored, swipe-dismissible sheets. Ensure overlays can be easily discarded via intuitive down-swipes or tapping outside the structural focus box.

---

## 6. Senior Frontend Engineering & Anti-Slop Design System

### Group A: Quantitative Dominance & Typographic Hierarchy
- **Metric-First Visual Anchoring**: Prioritize raw quantitative metrics over semantic titles or metadata labels. Format numerical values significantly larger than their context labels (e.g., 32px to 48px bold tracking-tight). Use tabular-monospace font variants (`font-variant-numeric: tabular-nums` or `font-mono`) to prevent layout shifts or numerical jitter during live database updates.
- **Label De-emphasis and Proximity**: Compress and mute description labels to force instant data focus. Position modifying titles or tags directly below the metric using precise, tight padding (under 4px). Drop label sizing down to 11px-12px, convert to medium weight, and apply a secondary/muted color token (`text-neutral-400` or `var(--text-muted)`). Never space labels and metrics equally.
- **Tabular and Functional Data Density**: Eradicate raw narrative prose or loose lists for data presentation. Flatten complex objects into precise alignment grids or high-density layout panels. Maximize scannability by binding contextual labels directly into the data matrix, completely eliminating empty or purely decorative whitespace.

### Group B: Iconography, Asset Hygiene & Anti-Slop Primitives
- **Strict Icon Package Enforcement**: Ban all generic UI emojis, raw inline SVG dumps, and un-optimized asset injections. Import explicit vector assets exclusively from modern, standardized, optimized icon packages (e.g., `lucide-react`, `@heroicons/react`). Wrap icons within dedicated sizing and color classes. Never paste massive raw multi-line SVG paths directly inside localized component layout files.
- **Zero Decorative Slop**: Absolute prohibition of ambient "AI Slop" styling gimmicks. Ban floating background gradients, un-aliased shadows, and fuzzy glassmorphic blurring filters used to hide poor text readability. Enforce visual structure using sharp, single-pixel crisp solid borders (`border border-neutral-800`) set against absolute dark backgrounds (`bg-black` or `bg-neutral-950`).

### Group C: Clutter Management, Color Tokens, and Redundancy Reduction
- **Absolute Input Minimization**: Avoid forcing manual keyboard text invocation for predictable user operations. Replace general open-ended text inputs with instant tap-to-select structural token cards, segmented option sliders, or predefined badge-choice blocks to radically minimize user effort and form friction.
- **Strict 90/10 Color Distribution**: Construct 90% of the display architecture using high-contrast, structural neutrals (deep charcoal, pitch blacks, precise cool grays). Limit high-saturation branding accents to crucial interactive destinations, reserving vivid accent color tokens exclusively for functional interactive responses, primary actions, or critical system warning states.
- **Elimination of Structural Redundancy**: Eradicate double-labeling and repeating descriptions. If a structural header or a dataset cell inherently clarifies context, never add redundant helper strings underneath it. Let precise styling, alignment, and data units (e.g., `$`, `ms`, `%`, `kb/s`) communicate meaning instantly.

### Group D: Native Mobile App Specific Interaction
*(Applies to Expo / React Native / Native Mobile development wrappers)*
- **Interruptible Gesture and Spring Physics**: Enforce physical interactive responsive physics on touch targets. Bind touch points to interruptible spring physics models. Target items must listen for drag-away flags or parent scrolling events; if the user scrolls the view or drifts their finger mid-press, seamlessly animate the touch asset back to rest and cancel the firing contract immediately.
- **Hardware Haptic Alignment**: Sync viewport alterations directly with device haptic physical responses. Programmatically trigger precise, micro-haptic ticks (`Haptics.impactAsync`) on critical state transitions, successful forms, and slider snaps to bridge software action with physical tactile reassurance.
- **Pre-Prompt Permission Orchestration**: Never initiate raw, unannounced native operating system access requests. Intercept physical permissions (Camera, Files, Location, Push notifications) behind a custom layout view detailing exactly what feature benefits are unlocked by the access. Invoke the native system prompt only after the user triggers explicit confirmation from this explanatory screen.

### Group E: Responsive Web Architecture
*(Applies to Tailwind CSS / React / Next.js Web applications)*
- **Web Sticky Hover Isolation**: Isolate mouse-overs to protect mobile touchscreen viewports from sticky element states. Enforce hover actions exclusively behind Tailwind's touch-safe hover modifier (`hover:text-white md:hover:bg-neutral-900`) or explicit media feature queries (`@media (hover: hover)`). Prevent tooltips, dropdown menus, or color states from getting stuck on mobile screens when a user taps away.
- **Content Layout Shift (CLS) Hard Containment**: Zero visual frame jumping or content shifting during asynchronous mutations. Enforce locked aspect ratios (`aspect-video`, `aspect-square`) and precise layout boxes around incoming data, dynamically parsed graphics, or media slots. Allocate rigid skeleton dimensions that match the incoming markup tree to secure absolute stability during Server-Side Rendering (SSR) and client hydration cycles.
- **Fluid Grid Safety Boundaries**: Prevent grid collapse, overlap, or line clipping on non-standard breakdown widths. Utilize CSS Grid layout rules (`grid-cols-[repeat(auto-fit,minmax(280px,1fr))]`) coupled with structural flexing flags. Ensure layout components naturally reflow or collapse fluidly across fine viewport transitions, blocking text truncation or overlap errors on narrow viewports.
