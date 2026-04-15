---
name: better-result-gen-patterns
description: better-result generator composition patterns. Use when writing, reviewing or refactoring code with Result.gen, yield*, or isErr()/try-catch patterns around Results.
references:
  - references/gen-anti-patterns.md
---

# better-result Gen Patterns

Write idiomatic `Result.gen` code. Avoid the anti-patterns that arise from treating `Result` like traditional try/catch error handling.

## When to Use

Use this skill when:

- writing new `Result.gen` blocks
- reviewing code that uses `Result.gen` or `yield*` with Results
- refactoring verbose Result-handling code into generator style

## Reading Order

| Task                               | Files to Read                     |
| ---------------------------------- | --------------------------------- |
| Write or review Result.gen code    | This file                         |
| See detailed before/after examples | `references/gen-anti-patterns.md` |
| Inspect library implementation     | `opensrc/` if present             |

## How Result.gen Works

`Result.gen` accepts a generator function. Inside the generator:

- `yield*` on a `Result` unwraps `Ok` values and short-circuits on `Err`
- For async Results, wrap with `Result.await`: `yield* Result.await(asyncFn())`
- The generator body must return `Result.ok(value)` or `Result.err(error)`
- Error types from all `yield*` sites automatically union in the return type

```ts
const result = Result.gen(function* () {
  const a = yield* getA(); // unwraps or short-circuits
  const b = yield* Result.await(getB(a)); // Result.await unwraps async
  return Result.ok({ a, b }); // must return a Result
});
// Result<{ a: A; b: B }, ErrorA | ErrorB>
```

## Core Principle

**`yield*` is your error propagation.** If you find yourself checking `isErr()`, re-wrapping errors, or writing try/catch inside a gen block, you are fighting the abstraction.

## Anti-Pattern Summary

| Anti-pattern                     | Fix                                               |
| -------------------------------- | ------------------------------------------------- |
| `isErr()` + re-return inside gen | Remove the check; `yield*` already short-circuits |
| Bespoke lift/wrap utilities      | Use `Result.await` + `mapError` directly          |
| try/catch around yield           | Use `Result.tryPromise` + `mapError` instead      |
| Gen block for a single Result    | Use `map`/`andThen` directly — gen is overkill    |

See [references/gen-anti-patterns.md](references/gen-anti-patterns.md) for detailed before/after code.

## When to Use Result.gen vs Combinators

| Situation                           | Prefer                             |
| ----------------------------------- | ---------------------------------- |
| Single Result transformation        | `map`, `andThen`                   |
| Two+ sequential Results             | `Result.gen`                       |
| Error type normalization            | `.mapError()` on result            |
| Conditional branching on error type | `match` or `matchError`            |
| Parallel independent Results        | `Result.all` / `Result.allSettled` |
