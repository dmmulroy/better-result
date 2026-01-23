---
name: better-result-migrate-neverthrow
description: Migrate TypeScript codebases from neverthrow to better-result. Use when replacing neverthrow Result/ResultAsync APIs (ok/err, mapErr, asyncAndThen, safeTry, fromPromise/fromThrowable, combine/orElse) with better-result Result.gen/try/tryPromise, TaggedError, and Panic semantics.
---

# Migrate from neverthrow to better-result

Migrate neverthrow Result/ResultAsync usage to better-result Result with generator-based composition, TaggedError unions, and Panic-based defect signaling.

## Scope and navigation
- Read `references/api-map.md` to map methods, constructors, and imports.
- Read `references/async.md` when ResultAsync, okAsync/errAsync, or fromPromise/fromThrowable appear.
- Read `references/recipes.md` for orElse/andThrough/andTee/orTee/combine rewrites and test helpers.

## Workflow
1. Find neverthrow usage by searching for `from "neverthrow"`, `ResultAsync`, `okAsync`, `errAsync`, `safeTry`, `mapErr`, `orElse`, `andThrough`, `_unsafeUnwrap`.
2. Replace imports and constructors: use `Result.ok`/`Result.err`, remove `ResultAsync`, and update Result types to `Promise<Result<...>>` when async.
3. Rename core methods: `mapErr` -> `mapError`, `asyncAndThen` -> `andThenAsync`, `match(ok, err)` -> `match({ ok, err })`. Use `Result.isError` if you need a static Err guard (instance `isErr()` is unchanged).
4. Convert async flows: replace `ResultAsync.fromPromise`/`fromThrowable` with `Result.tryPromise`, and prefer `Result.gen` + `Result.await` for multi-step async chains.
5. Rewrite missing combinators: use `match` for `orElse`, `tap` or `match` for `andTee`/`orTee`, `Result.gen` for `andThrough`, and `Result.partition` for `combineWithAllErrors`.
6. Normalize error types: introduce TaggedError classes for domain errors and use `matchError`/`matchErrorPartial` for exhaustive handling.
7. Update tests: replace `_unsafeUnwrap` with `unwrap()` or `Result.isOk` assertions and compare against `Result.ok(...)`.

## Notes
- Callbacks that throw in better-result raise `Panic`; do not convert to Err.
- `Result.try` and `Result.tryPromise` default to `UnhandledException` unless you provide a `catch` mapper.
