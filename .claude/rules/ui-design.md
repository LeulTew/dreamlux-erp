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
- **Border Radius**: Keep border radius minimal matching our global custom theme variables:
  - Use `rounded-sm` (which maps to **`8px`** in `globals.css`) as the default maximum for structural icons and small buttons.
  - Use `rounded-md` (which maps to **`10px`** in `globals.css`) as the absolute ceiling for cards or main content blocks.
  - Avoid overly pill-shaped or round shapes for structural containers unless explicitly requested.
- **Shadows**: Keep shadows minimal or completely flat. Rely on clean, high-contrast borders (`1px border-border` or `border-gold/20`) to separate components instead of large, blurred shadows.

---

## 4. Contrast & Legibility
- **Contrast Ratios**: Always verify that all text colors, SVGs, and icon fills satisfy standard Web Content Accessibility Guidelines (WCAG) contrast ratios (min 4.5:1 for regular text, min 3:1 for large text).
- **Hovers & Transitions**: Verify that interactive hover and focus states provide strong visual contrast indicators.
- **Web Sticky Hover Isolation**: Isolate mouse-overs to protect mobile touchscreen viewports from sticky element states. Enforce hover actions exclusively behind Tailwind's touch-safe hover modifier (`md:hover:...`) to prevent tooltips or color states from getting stuck on mobile screens when a user taps away.

---

## 5. Mobile Touch UX (< 768px Width)
- **Lower-Third Zone**: Position global filtering menus, confirmation buttons, checkout steps, and primary actions within the lower 33% to 40% of the viewport area.
- **Tap Footprint**: Enforce a rigid touch target geometry of at least 48x48px for every actionable element. Isolate adjacent buttons or links with a clear margin boundary (minimum 8px) to prevent misclicks.
- **Progressive Bottom Sheets**: Replace intrusive full-screen center layout alerts and modals with progressive bottom sheets (e.g. using `vaul` drawers or swipe-dismissible overlays).
