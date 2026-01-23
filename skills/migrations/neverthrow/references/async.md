# Async migration patterns

## Replace ResultAsync with Promise<Result>
- Use `Promise<Result<T, E>>` instead of `ResultAsync<T, E>`.
- Prefer `Result.gen` + `Result.await` for multi-step async flows.

## Constructors
- `okAsync(value)` -> `Promise.resolve(Result.ok(value))`
- `errAsync(error)` -> `Promise.resolve(Result.err(error))`

## Wrapping promises

```ts
// NEVERTHROW
const user = ResultAsync.fromPromise(fetchUser(id), toApiError);

// BETTER-RESULT
const user = Result.tryPromise({
  try: () => fetchUser(id),
  catch: toApiError,
});
```

```ts
// NEVERTHROW
const insertUser = ResultAsync.fromThrowable(db.insertUser, toDbError);

// BETTER-RESULT
const insertUser = (user: User) =>
  Result.tryPromise({
    try: () => db.insertUser(user),
    catch: toDbError,
  });
```

## Replace async chains with Result.gen

```ts
// NEVERTHROW
const result = ResultAsync.fromPromise(fetchUser(id), toApiError)
  .andThen(validateUser)
  .andThen(saveUser);

// BETTER-RESULT
const result = await Result.gen(async function* () {
  const user = yield* Result.await(
    Result.tryPromise({ try: () => fetchUser(id), catch: toApiError })
  );
  const valid = yield* validateUser(user);
  const saved = yield* Result.await(saveUser(valid));
  return Result.ok(saved);
});
```

## Replace asyncMap or asyncAndThen

```ts
// NEVERTHROW
const result = parsed.asyncMap(transformAsync);

// BETTER-RESULT
const result = await parsed.andThenAsync(async (value) =>
  Result.ok(await transformAsync(value))
);
```

## Handle results at the boundary

```ts
const resolved = await resultPromise;
const message = resolved.match({
  ok: (value) => `ok: ${value}`,
  err: (error) => `err: ${error}`,
});
```
