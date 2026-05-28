---
name: audit-better-result-dependents
description: Audit better-result changes or PRs against known Prisma and Better T Stack downstream dependents. Use when working on better-result API/type/runtime changes and the user asks whether a change breaks Prisma dependents, Better T Stack dependents, npm dependents, or PR compatibility.
---

# Audit better-result dependents

## Quick start

From the `better-result` repo, run the audit script with identifiers touched by the change:

```sh
node .agents/skills/audit-better-result-dependents/scripts/audit-dependents.mjs isTaggedError 'TaggedError\.is' 'toJSON'
```

If no patterns are provided, the script searches common `better-result` usage patterns.

## Scope

Always check these npm dependents:

- `@prisma/compute-sdk`
- `@prisma/streams-server`
- `@prisma/streams-local`
- `create-better-t-stack`
- `@better-t-stack/template-generator`

The script uses npm registry metadata to resolve latest versions and commits. For public GitHub repos it checks out the published `gitHead`; if a repo is private/unavailable, it falls back to `npm pack` and audits the published source/package.

## Workflow

1. **Identify risk surface**
   - List changed public exports, guards, types, class methods, overloads, and runtime semantics.
   - Convert them into grep patterns, escaping regex metacharacters when needed.

2. **Run local validation first**
   - `bun run fmt`
   - `bun run check`
   - `bun run test`
   - `bun run lint`

3. **Audit dependents**
   - Run the script with risk patterns.
   - Inspect actual matching files with `read`; do not rely only on counts.
   - Distinguish generic guards (e.g. `isTaggedError`) from class-specific guards (e.g. `FooError.is`).

4. **Assess breakage**
   - Runtime breaking: dependent passes values that no longer satisfy a changed guard/shape.
   - Type breaking: dependent references narrowed types, overloads, exported names, or structural constraints that changed.
   - Safe: dependent only creates `TaggedError(...)` instances or uses class-specific `.is()` unaffected by the change.

5. **Report clearly**
   - Include package name, version, source audited (GitHub commit or npm package), relevant matches, and risk conclusion.
   - If opening a PR, include the dependent audit summary in the PR body.

## Notes

- `@prisma/compute-sdk` may point at a private/404 GitHub repo; audit the npm package source when cloning fails.
- `@prisma/streams-server` and `@prisma/streams-local` share the `prisma/streams` repo and usually the same `gitHead`.
- `create-better-t-stack` and `@better-t-stack/template-generator` share the `AmanVarshney01/create-better-t-stack` repo and usually the same `gitHead`.
- Never modify cloned dependent repositories during audit; use temp directories only.
