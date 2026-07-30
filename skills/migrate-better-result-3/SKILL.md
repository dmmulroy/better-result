---
name: migrate-better-result-3
description: Migrate a TypeScript codebase from better-result 2.x to 3.0. Use when upgrading better-result across the TaggedError syntax, removed Result serialization helpers, recovery inference, matching, or retry APIs.
---

# Migrate better-result to 3.0

Treat the compiler as the migration ledger: inventory first, make mechanical changes, then resolve each remaining error by API branch.

## 1. Establish the migration surface

Read repository instructions, package manifests, lockfiles, TypeScript configuration, and validation commands. Verify that the source version is `better-result` 2.x and inspect the installed 3.0 declarations when available; package source outranks remembered APIs.

Search production code and tests for:

```sh
rg -n --glob '*.{ts,tsx,mts,cts}' \
  'TaggedError|Result\.(serialize|deserialize|hydrate|tryRecover|tryRecoverAsync|tryPromise|partition)|matchError(Partial)?|TaggedErrorClass|Serialized(Result|Ok|Err)'
```

Classify every hit under the audited API changes in [references/v3-api-diff.md](references/v3-api-diff.md). Record generated or vendored hits separately rather than editing them.

**Complete when:** the installed source version, target 3.0 API, validation commands, and every matching production/test site are accounted for by file and migration branch.

## 2. Apply the TaggedError codemod

List safe trailing-call edits:

```sh
node <skill-dir>/scripts/migrate-tagged-error-v3.mjs . --list
```

Review the listed class heritage expressions, then apply them:

```sh
node <skill-dir>/scripts/migrate-tagged-error-v3.mjs . --write
node <skill-dir>/scripts/migrate-tagged-error-v3.mjs . --check
```

The transform changes only the v2 class heritage shape:

```ts
class NotFoundError extends TaggedError("NotFoundError")<{ id: string }>() {}
// becomes
class NotFoundError extends TaggedError("NotFoundError")<{ id: string }> {}
```

It preserves constructors, properties, formatting, and call sites. Manually update exported `TaggedErrorClass<Tag, Props>` annotations to the v3 class type `TaggedErrorClass<Tag>`; move payload typing to the subclass application shown above.

**Complete when:** the script's check exits successfully and searches find no v2 trailing factory calls or two-argument `TaggedErrorClass` uses outside generated/vendor code.

## 3. Replace removed serialization helpers

If the inventory contains `Result.serialize`, `Result.deserialize`, or `Result.hydrate`, follow [references/result-codec-migration.md](references/result-codec-migration.md). Design codecs at each transport or persistence boundary instead of creating one unvalidated global compatibility shim.

Account for changed control flow: serialization can now return `ResultSerializationError`; deserialization adds `ResultDeserializationError`; sync/async schemas determine whether codec operations return a `Result` or `Promise<Result>`.

**Complete when:** every removed-helper call has an owning codec with schemas for both Result branches, and every codec error and async return is handled at its boundary.

## 4. Reconcile changed inference and optional APIs

Type-check after the mechanical and codec changes. Resolve diagnostics using [references/v3-api-diff.md](references/v3-api-diff.md), especially:

- `tryRecover` and `tryRecoverAsync` now preserve the original success and union it with a different recovered success type.
- `matchError` and `matchErrorPartial` infer unions from divergent handler returns.
- `matchErrorPartial` may omit its fallback; an unhandled tagged error is then returned unchanged.
- `Result.partition` now supports heterogeneous inputs; `all`, `allAsync`, and `partitionAsync` are new.
- `Result.tryPromise` adds abort context, dynamic delays, and jitter while retaining valid v2 static retry configurations.

Keep existing runtime behavior unless the user requested adoption of a new 3.0 capability. Prefer accurate widened types and explicit narrowing over casts.

**Complete when:** every compiler diagnostic caused by a changed 3.0 signature is resolved, every intentional inferred union reaches an explicit handling point, and unrelated behavior remains unchanged.

## 5. Upgrade and prove the migration

Update the direct dependency and lockfile to the requested stable or prerelease 3.0 version. Run formatting, lint, type-check, tests, and build commands required by the repository. Repeat the inventory search and the codemod check.

Report the version change, files migrated by branch, codec/error-handling decisions, adopted optional features, and validation evidence.

**Complete when:** no removed API or v2 TaggedError syntax remains outside recorded generated/vendor code, all inventoried sites are closed, and every repository check passes or has a concrete reported failure.
