# Rewrite recipes

## Table of contents
- orElse -> match
- andTee/orTee -> tap or match
- andThrough/asyncAndThrough -> Result.gen
- combine/combineWithAllErrors -> loops or partition
- safeTry -> Result.gen
- Test helpers

## orElse -> match

```ts
// NEVERTHROW
const recovered = result.orElse((e) =>
  e.type === "NotFound" ? ok(defaultValue) : err(e)
);

// BETTER-RESULT
const recovered = result.match({
  ok: Result.ok,
  err: (e) => (e._tag === "NotFoundError" ? Result.ok(defaultValue) : Result.err(e)),
});
```

## andTee/orTee -> tap or match

```ts
// NEVERTHROW
const withSideEffect = result.andTee(logValue);

// BETTER-RESULT
const withSideEffect = result.tap(logValue);
```

```ts
// NEVERTHROW
const withErrorSideEffect = result.orTee(logError);

// BETTER-RESULT
const withErrorSideEffect = result.match({
  ok: Result.ok,
  err: (e) => {
    logError(e);
    return Result.err(e);
  },
});
```

## andThrough/asyncAndThrough -> Result.gen

```ts
// NEVERTHROW
const checked = parseInput(input).andThrough(validateInput);

// BETTER-RESULT
const checked = Result.gen(function* () {
  const value = yield* parseInput(input);
  yield* validateInput(value);
  return Result.ok(value);
});
```

```ts
// NEVERTHROW
const checked = parseInput(input).asyncAndThrough(validateInputAsync);

// BETTER-RESULT
const checked = await Result.gen(async function* () {
  const value = yield* parseInput(input);
  yield* Result.await(validateInputAsync(value));
  return Result.ok(value);
});
```

## combine/combineWithAllErrors -> loops or partition

```ts
const combine = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (result.isErr()) return Result.err(result.error);
    values.push(result.value);
  }
  return Result.ok(values);
};
```

```ts
const [oks, errs] = Result.partition(results);
const combined = errs.length > 0 ? Result.err(errs) : Result.ok(oks);
```

```ts
// Tuple style with Result.gen
const combined = Result.gen(function* () {
  const a = yield* first;
  const b = yield* second;
  return Result.ok([a, b] as const);
});
```

## safeTry -> Result.gen

```ts
// NEVERTHROW
const result = safeTry(function* () {
  const a = yield* parseA();
  const b = yield* parseB();
  return ok(a + b);
});

// BETTER-RESULT
const result = Result.gen(function* () {
  const a = yield* parseA();
  const b = yield* parseB();
  return Result.ok(a + b);
});
```

```ts
// Async safeTry -> async Result.gen
const result = await Result.gen(async function* () {
  const a = yield* Result.await(fetchA());
  const b = yield* Result.await(fetchB());
  return Result.ok(a + b);
});
```

## Test helpers

```ts
// NEVERTHROW
expect(result._unsafeUnwrap()).toEqual(value);

// BETTER-RESULT
expect(result.unwrap()).toEqual(value);
```

```ts
// Assert Err without _unsafeUnwrapErr
if (result.isOk()) {
  throw new Error("expected Err");
}
expect(result.error).toEqual(expectedError);
```
