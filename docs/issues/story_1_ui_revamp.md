# [Story] UI & Contrast Revamp

**Issue ID**: `STORY-1`
**Epic Link**: `[EPIC-1](epic_1_dreamlux_rebrand.md)`
**Labels**: `type:story`, `area:rebranding`, `priority:p0`, `status:ready`

---

## User Story

As the Owner of Dream Lux, I want a premium and elegant user interface with clear contrast and elegant gold tones, so that the application represents our luxury event branding and remains highly accessible.

## Context

The current demo UI is generic and uses standard colors/borders. We need a modern, professional look that eliminates rounded pill styles and soft shadows, replacing them with crisp borders, minimal border-radius (6px-8px), elegant gold gradients, and strict WCAG contrast validation.

## Acceptance Criteria

- **Elegant Color Scheme**:
  - Gold accents (`#D4AF37`) used for key links, primary buttons, and borders.
  - Dark mode configured with deep charcoal/navy bases and gold/white text.
  - Tasteful gold gradients applied to main dashboard cards and login views.
- **Strict Visual Design Standards**:
  - No overly rounded corners (keep borders to standard `6px`-`8px` max).
  - Minimal to no box-shadows; use crisp `1px` high-contrast borders for separation.
  - Zero "AI slop" terminology, spaceship metaphors, or gamified layout blocks.
- **Contrast & Legibility (2026 Best Practices)**:
  - All text, icons, and SVG states (including active and hover indicators) must satisfy the WCAG AA minimum contrast ratio (4.5:1).
  - Hover states on lists and buttons must have a clear visual feedback state.

## Sub-Tasks

- [ ] Modify `frontend/src/app/globals.css` with the gold/slate design system tokens.
- [ ] Refactor `frontend/src/components/NavBar.tsx` to match the new contrast and typography layout.
- [ ] Clean up pages to remove generic placeholders and align visual styling.
- [ ] Implement bilingual support (Amharic & English) toggle in navigation.

## Verification Plan

### Automated
- Execute frontend compilation checks (`bun run build` in `frontend`).
- Run linter checks (`bun run lint`).

### Manual
- Inspect color contrast using browser accessibility tools.
- Verify desktop and mobile layouts down to 320px width.
- Check hover states on all menu items, tabs, and action items.
