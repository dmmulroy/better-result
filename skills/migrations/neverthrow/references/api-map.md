# Neverthrow to better-result API map

## Table of contents
- Quick renames
- Same-name equivalents
- Renamed or reshaped equivalents
- Requires rewrite
- Import mapping
- Match and error matching

## Quick renames
- `ok` -> `Result.ok`
- `err` -> `Result.err`
- `mapErr` -> `mapError`
- `asyncAndThen` -> `andThenAsync`
- `match(ok, err)` -> `match({ ok, err })`

## Same-name equivalents
| neverthrow | better-result | Notes |
| --- | --- | --- |
| `Ok` / `Err` | `Ok` / `Err` | Same class names; better-result uses `status: "ok" | "error"`. |
| `isOk()` / `isErr()` | `isOk()` / `isErr()` | Instance type guards in both; better-result also adds static guards (`Result.isOk(result)`, `Result.isError(result)`). neverthrow has no static guards. |
| `map` | `map` | Same behavior on Ok. |
| `andThen` | `andThen` | Same behavior; error unions widen. |
| `unwrapOr` | `unwrapOr` | Same behavior. |

## Renamed or reshaped equivalents
| neverthrow | better-result | Notes |
| --- | --- | --- |
| `ok(value)` | `Result.ok(value)` | Construction is namespaced. |
| `err(error)` | `Result.err(error)` | Construction is namespaced. |
| `mapErr(fn)` | `mapError(fn)` | Rename only. |
| `asyncAndThen(fn)` | `andThenAsync(fn)` | Returns `Promise<Result<...>>`. |
| `match(ok, err)` | `match({ ok, err })` | Object argument instead of two callbacks. |
| `Result.fromThrowable(fn, mapErr)` | `Result.try({ try: () => fn(...), catch: mapErr })` | Wrap in a new function. |
| `ResultAsync.fromPromise(p, mapErr)` | `Result.tryPromise({ try: () => p, catch: mapErr })` | Promise is thunked. |
| `ResultAsync.fromThrowable(fn, mapErr)` | `Result.tryPromise({ try: () => fn(...), catch: mapErr })` | Handles sync throw. |

## Requires rewrite
| neverthrow | better-result pattern | Notes |
| --- | --- | --- |
| `ResultAsync<T, E>` | `Promise<Result<T, E>>` + `Result.gen` | No ResultAsync class. |
| `okAsync` / `errAsync` | `Promise.resolve(Result.ok/err)` | Or keep sync `Result.ok/err` when possible. |
| `Result.asyncMap` | `andThenAsync` or `Result.gen` | Map a Promise-returning function. |
| `orElse` | `match` with explicit recovery | See `references/recipes.md`. |
| `andTee` / `orTee` | `tap` / `match` | `tap` is Ok-only. |
| `andThrough` / `asyncAndThrough` | `Result.gen` | Yield validation then return original value. |
| `combine` | Manual loop or `Result.gen` | Short-circuit explicitly. |
| `combineWithAllErrors` | `Result.partition` + aggregation | Collect all errors manually. |
| `safeTry` | `Result.gen` | Generator-based unwrapping. |
| `_unsafeUnwrap` / `_unsafeUnwrapErr` | `unwrap` or `match` in tests | `unwrap` throws `Panic` on Err. |

## Better-result helpers without neverthrow equivalents
- Static type guards: `Result.isOk(result)` and `Result.isError(result)`. neverthrow only provides this at the instance level (`result.isOk()` / `result.isErr()`).

## Import mapping

```ts
// NEVERTHROW
import { ok, err, Result, ResultAsync, safeTry } from "neverthrow";

// BETTER-RESULT
import { Result, TaggedError, matchError } from "better-result";
```

## Match and error matching

```ts
// NEVERTHROW
const message = result.match(
  (value) => `ok: ${value}`,
  (error) => `err: ${error}`
);

// BETTER-RESULT
const message = result.match({
  ok: (value) => `ok: ${value}`,
  err: (error) => `err: ${error}`,
});

// TaggedError matching
const message2 = matchError(error, {
  NotFoundError: (e) => `Missing: ${e.id}`,
  ValidationError: (e) => `Invalid: ${e.field}`,
});
```
