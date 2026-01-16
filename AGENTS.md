# better-result

**Generated:** 2026-01-08 | **Commit:** 98ebd76 | **Branch:** main

## OVERVIEW

Lightweight TypeScript Result type with generator-based composition. Functional error handling via `Ok`/`Err` discriminated union with `yield*` syntax for railway-oriented programming.

## STRUCTURE

```
better-result/
├── src/
│   ├── index.ts      # Public API barrel export
│   ├── result.ts     # Core Result type, Ok/Err classes, combinators
│   ├── error.ts      # TaggedError base class, UnhandledException
│   └── dual.ts       # data-first/data-last function helper
├── dist/             # Compiled output (committed)
└── package.json      # ESM library, Bun runtime
```

## WHERE TO LOOK

| Task                  | Location            | Notes                              |
| --------------------- | ------------------- | ---------------------------------- |
| Add Result method     | `src/result.ts`     | Add to both `Ok` and `Err` classes |
| Add static combinator | `src/result.ts:966` | `Result` namespace object          |
| New error type        | `src/error.ts`      | Extend `TaggedError`, add `_tag`   |
| Change exports        | `src/index.ts`      | Barrel file                        |

## CODE MAP

| Symbol              | Type  | Location       | Role                           |
| ------------------- | ----- | -------------- | ------------------------------ |
| `Ok<A, E>`          | class | result.ts:33   | Success variant, E is phantom  |
| `Err<T, E>`         | class | result.ts:264  | Error variant, T is phantom    |
| `Result<T, E>`      | type  | result.ts:503  | Union: `Ok<T,E> \| Err<T,E>`   |
| `Result.gen`        | fn    | result.ts:806  | Generator-based composition    |
| `Result.try`        | fn    | result.ts:542  | Wrap sync throwing fn          |
| `Result.tryPromise` | fn    | result.ts:590  | Wrap async throwing fn + retry |
| `TaggedError`       | class | error.ts:13    | Base for discriminated errors  |
| `dual`              | fn    | dual.ts:21     | Creates pipeable functions     |

## CONVENTIONS

- **Strict TypeScript**: `noUncheckedIndexedAccess`, full strict mode
- **ESM only**: No CommonJS (`"type": "module"`)
- **Bun runtime**: `bun test`, `bun run build`
- **Phantom types**: `Ok<A, E>` and `Err<T, E>` both carry phantom type for the other variant
- **Dual API**: All combinators support both `fn(result, arg)` and `fn(arg)(result)`

## ANTI-PATTERNS

- **No `any` escape hatches** except `dual.ts` (unavoidable for arity dispatch)
- **SAFETY comments**: Required when casting phantom types (`as unknown as`)
- **Tests exist**: `bun test` runs test suite in `src/result.test.ts`

## UNIQUE STYLES

### Phantom Type Casts

All `as unknown as X` casts in result.ts are SAFETY-documented phantom type changes:

```typescript
// SAFETY: E is phantom on Ok (not used at runtime).
return this as unknown as Ok<A, E2>;
```

### Generator Protocol

`Ok` and `Err` implement `[Symbol.iterator]` for `yield*` syntax:

```typescript
const result = Result.gen(function* () {
  const a = yield* getA(); // Unwraps Ok, short-circuits on Err
  const b = yield* getB(a);
  return Result.ok({ a, b });
});
```

### Async Generators

Use `Result.await` to yield Promise<Result> in async generators:

```typescript
const result = await Result.gen(async function* () {
  const a = yield* Result.await(fetchA());
  return Result.ok(a);
});
```

## COMMANDS

```bash
bun run build     # tsc compilation
bun run check     # Type-check only (--noEmit)
bun test          # Run tests
```

## NOTES

- **dist/ is committed**: Unusual for libraries; published via npm
- **No CI/CD**: Tests/builds run locally only
- **No linter/formatter**: Rely on editor defaults

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->