# better-result

**Generated:** 2026-01-19 | **Commit:** fb308ef | **Branch:** main

## OVERVIEW

Lightweight TypeScript Result type with generator-based composition. Functional error handling via `Ok`/`Err` discriminated union with `yield*` syntax for railway-oriented programming.

## STRUCTURE

```
better-result/
├── src/
│   ├── index.ts         # Public API barrel export
│   ├── result.ts        # Core Result type, Ok/Err classes, combinators
│   ├── error.ts         # TaggedError base class, UnhandledException, Panic
│   ├── dual.ts          # data-first/data-last function helper
│   ├── result.test.ts   # Result tests (~1600 lines)
│   └── error.test.ts    # TaggedError tests (~250 lines)
├── skills/              # Portable SKILL.md agent skills
│   └── adopt-better-result/
├── dist/                # Compiled output (committed for npm)
└── opensrc/             # Fetched dependency source for AI context
```

## WHERE TO LOOK

| Task                  | Location                   | Notes                                      |
| --------------------- | -------------------------- | ------------------------------------------ |
| Add Result method     | `src/result.ts`            | Add to both `Ok` and `Err` classes         |
| Add static combinator | `src/result.ts:782`        | `Result` namespace object                  |
| New error type        | `src/error.ts`             | Extend `TaggedError`, add `_tag`           |
| Change exports        | `src/index.ts`             | Barrel file                                |
| Add tests             | `src/*.test.ts`            | Colocated, Vitest runner                   |
| Update agent skills   | `skills/*/SKILL.md`        | Keep `name:` matching the directory name   |
| Add skill references  | `skills/*/references/*.md` | Prefer linked references over giant skills |

## CODE MAP

| Symbol               | Type  | Location      | Role                             |
| -------------------- | ----- | ------------- | -------------------------------- |
| `Ok<A, E>`           | class | result.ts:32  | Success variant, E is phantom    |
| `Err<T, E>`          | class | result.ts:203 | Error variant, T is phantom      |
| `Result<T, E>`       | type  | result.ts:361 | Union: `Ok<T,E> \| Err<T,E>`     |
| `Result` namespace   | obj   | result.ts:782 | Static combinators               |
| `Result.gen`         | fn    | result.ts:594 | Generator-based composition      |
| `Result.try`         | fn    | result.ts:400 | Wrap sync throwing fn            |
| `Result.tryPromise`  | fn    | result.ts:448 | Wrap async throwing fn + retry   |
| `TaggedError`        | fn    | error.ts:35   | Factory for discriminated errors |
| `UnhandledException` | class | error.ts:186  | Wrapper for uncaught exceptions  |
| `Panic`              | class | error.ts:215  | Unrecoverable error (throws)     |
| `dual`               | fn    | dual.ts:20    | Creates pipeable functions       |

## CONVENTIONS

- **Strict TypeScript**: `noUncheckedIndexedAccess`, full strict mode
- **ESM only**: No CommonJS (`"type": "module"`)
- **Bun toolchain**: Use `bun run test` for Vitest and `bun run build` for packaging
- **Phantom types**: `Ok<A, E>` and `Err<T, E>` both carry phantom type for the other variant
- **Dual API**: All combinators support both `fn(result, arg)` and `fn(arg)(result)`
- **Ox toolchain**: `oxlint` for linting, `oxfmt` for formatting (Rust-based, fast)
- **tsdown bundler**: Beta version, not raw tsc

## ANTI-PATTERNS

- **No `any` escape hatches** except `dual.ts` (unavoidable for arity dispatch)
- **SAFETY comments**: Required when casting phantom types (`as unknown as`)
- **No non-null assertion** (`!`) - use proper narrowing
- **No bare type assertions** (`as Type`) without SAFETY documentation

## UNIQUE STYLES

### Phantom Type Casts

All `as unknown as X` casts are SAFETY-documented phantom type changes:

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

## TEST PATTERNS

- **Colocated**: `*.test.ts` in `src/` alongside implementation
- **Vitest runtime tests**: Import `describe`/`it`/`expect` from `vitest` in `*.test.ts`
- **Vitest type tests**: Use `expectTypeOf` in `*.test-d.ts`; `bun run test` runs them with `tsc`
- **Law verification**: Explicit Functor/Monad law tests
- **Custom errors**: Per-file test error classes with `_tag`

## COMMANDS

```bash
bun run build     # tsdown compilation
bun run check     # Type-check only (--noEmit)
bun run test      # Run Vitest runtime and type tests
bun run test:watch # Run Vitest in watch mode
bun run lint      # oxlint
bun run fmt       # oxfmt format
bun run fmt:check # oxfmt check
```
