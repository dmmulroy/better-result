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
  'TaggedError|Result\.(serialize|deserialize|hydrate|tryRecover|tryRecoverAsync|tryPromise|partition|gen)|matchError(Partial)?|TaggedErrorClass|Serialized(Result|Ok|Err)'
```

Classify every hit under the audited API changes in [references/v3-api-diff.md](references/v3-api-diff.md). Include tests that structurally compare a `Result` containing a tagged error; tagged errors become iterable in v3 even though the `Result.gen` signature is unchanged. Record generated or vendored hits separately rather than editing them.

**Complete when:** the installed source version, target 3.0 API, validation commands, every matching production/test site, and every tagged-error Result assertion are accounted for by file and migration branch.

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

If the inventory contains `Result.serialize`, `Result.deserialize`, or `Result.hydrate`, follow [references/result-codec-migration.md](references/result-codec-migration.md). The owning codec validates one application contract: a method's actual Ok and Err payloads in both directions. Share schema fragments, factories, and error-policy helpers across codecs; keep distinct success contracts in distinct named codecs.

Account for changed control flow: serialization can now return `ResultSerializationError`; deserialization adds `ResultDeserializationError`; sync/async schemas determine whether codec operations return a `Result` or `Promise<Result>`.

**Complete when:** every removed-helper call has a method- or boundary-specific codec with four payload schemas, every wire Err is reconstructed as the intended domain error, and every codec error and async return is handled at its boundary.

## 4. Reconcile changed inference and optional APIs

Type-check after the mechanical and codec changes. Resolve diagnostics using [references/v3-api-diff.md](references/v3-api-diff.md), especially:

- `tryRecover` and `tryRecoverAsync` now preserve the original success and union it with a different recovered success type.
- `matchError`, `matchErrorPartial`, and the additive `TaggedError#match` method infer unions from divergent handler returns. Exhaustive matching turns thrown handlers into `Panic`; `match` is reserved, so rename payload or subclass collisions rejected by the v3 types.
- `matchErrorPartial` may omit its fallback; an unhandled tagged error is then returned unchanged.
- `Result.partition` now supports heterogeneous inputs; `all`, `allAsync`, and `partitionAsync` are new.
- `Result.tryPromise` adds abort context, dynamic delays, and jitter while retaining valid v2 static retry configurations.
- Tagged errors are iterable for direct `yield*` in `Result.gen`. Replace structural deep-equality assertions over tagged errors with separate Result-status and error identity/field assertions.

Keep existing runtime behavior unless the user requested adoption of a new 3.0 capability. Prefer accurate widened types and explicit narrowing over casts.

**Complete when:** every compiler diagnostic caused by a changed 3.0 signature is resolved, every intentional inferred union reaches an explicit handling point, and unrelated behavior remains unchanged.

## 5. Upgrade and prove the migration

Update the direct dependency and lockfile to the exact requested stable or prerelease 3.0 version. Keep that version fixed while diagnosing migration behavior.

Run one targeted migrated test first. Read the package script and package-manager argument-passthrough rules, then verify the runner's collected-file output contains only the intended test files. Run formatting, lint, type-check, the full test suite, and build commands required by the repository. Repeat the inventory search and the codemod check. Preserve unrelated files when a repository-wide formatter reports pre-existing failures.

Report the version change, files migrated by branch, codec/error-handling decisions, adopted optional features, and validation evidence.

**Complete when:** the targeted run exercised only its intended files, no removed API or v2 TaggedError syntax remains outside recorded generated/vendor code, all inventoried sites are closed, the requested version is still installed, and every repository check passes or has a concrete reported failure.
