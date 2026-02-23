# Contributing to Nonotion

Thanks for your interest in contributing!

## Getting Started

1. Fork and clone the repo
2. Install dependencies: `pnpm install`
3. Build shared package: `pnpm --filter @nonotion/shared build`
4. Start dev servers: `pnpm dev`

See [README.md](README.md) for full setup details.

## Development

- **Shared types must be rebuilt** after changes: `pnpm --filter @nonotion/shared build`
- **Check types** before committing: `pnpm --filter @nonotion/web tsc --noEmit && pnpm --filter @nonotion/api tsc --noEmit`
- **Run E2E tests**: `pnpm --filter @nonotion/e2e test:e2e`

## Code Conventions

- TypeScript strict mode — no `any`
- Functional React components with Zustand for state
- Zod validation on all API inputs
- Business logic in services, routes stay thin
- Tailwind for styling, no CSS files
- See `CLAUDE.md` for detailed architecture docs

## Pull Requests

1. Create a feature branch from `main`
2. Keep PRs focused — one feature or fix per PR
3. Include a clear description of what and why
4. Ensure TypeScript compiles and E2E tests pass
5. Screenshots appreciated for UI changes

## Reporting Bugs

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS if relevant

## Feature Requests

Open a GitHub issue with the `enhancement` label. Describe the use case, not just the solution.
