## Summary

Provide a brief description of the changes introduced in this PR and their business/architectural rationale.

## Linked Issue

Closes # (or relates to #)

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Database migration (introduces schema alterations or indexes)
- [ ] Documentation update

## Verification & QA

Describe the steps you took to verify your changes. Include specific inputs/outputs and command outputs.

- [ ] Code compiles without TypeScript errors (`bun run typecheck` or equivalent)
- [ ] Linter passes without warnings or errors (`bun run lint`)
- [ ] Unit tests pass successfully (`bun test`)
- [ ] Dry-run migration performed locally (for schema changes)

### Visual Evidence (for UI changes)

_Include screenshots or screen recordings showing desktop AND mobile views (min-width: 320px for low-end Android layout check)._

## Data / Migration Notes

_Explain any changes to database tables, data types, indexes, default values, or data seed updates. Detail the migration rollback plan._

## Deployment Notes

_State any environment variables, feature flags, or infrastructure changes required before or after release._

## AI Usage & Self-Audit

- Were any AI prompts modified? (If yes, provide before/after or eval results)
- Did you follow the codebase structure rules in `.github/ai_templates/agent_structure.md`? (Yes/No)
- Did you verify that tap targets are at least 48px high on mobile views? (Yes/No)
