# Gen Anti-Patterns

Detailed before/after examples for common `Result.gen` mistakes.

## 1. Manual isErr() Short-Circuit

Mistake: checking `isErr()` repetitively instead of using `yield*`.

### Bad

```ts
const result = function () {
  const user = fetchUser();
  if (user.isErr()) {
    return Result.err(user.error);
  }
  const post = fetchPost();
  if (post.isErr()) {
    return Result.err(post.error);
  }
  return Result.ok(user);
};
```

### Good

```ts
const result = await Result.gen(async function* () {
  const user = yield* fetchUser();
  const post = yield* fetchPost();
  return Result.ok(user);
});
```

## 2. Weird bespoke utilities

Mistake: creating utils to avoid being explicit

### Bad

```ts
function lift<V, E>(result: Result<V, E>) {
  if (result.isErr()) {
    return Result.err(new Error());
  }
  return Result.ok(result.value);
}

function liftp<V, E>(result: Promise<Result<V, E>>) {
  return result.then((value) => lift(value, label));
}

const result = await Result.gen(async function* () {
  const user = yield* Result.await(fetchUser());
  const order = liftp(fetchOrder());
  return Result.ok(order);
});
```

### Good

```ts
const result = await Result.gen(async function* () {
  const user = yield* Result.await(fetchUser());
  const order = yield* Result.await(fetchOrder());
  return Result.ok(order);
});
```

## 3. Try/Catch Inside Gen Blocks

Mistake: wrapping `yield*` in try/catch to handle specific errors defeats the generator pattern.

### Bad

```ts
const result = await Result.gen(async function* () {
  let user;
  try {
    user = yield* Result.await(fetchUser());
  } catch {
    return Result.err(new FallbackError());
  }
  return Result.ok(user);
});
```

### Good

If `fetchUser()` returns a plain `Promise<User>` that may throw, wrap it:

```ts
const result = await Result.gen(async function* () {
  const user = yield* Result.await(Result.tryPromise(fetchUser()));
  return Result.ok(user);
});
```

If you want to map that wrapped error:

```ts
const result = await Result.gen(async function* () {
  const user = yield* Result.await(Result.tryPromise(fetchUser()));
  return Result.ok(user);
}).mapError(() => new FallbackError());
```

## 4. Gen Block for a Single Result

Mistake: If you're only yielding one Result, `Result.gen` adds ceremony without value.

### Bad

```ts
const result = Result.gen(function* () {
  const parsed = yield* parseInput(raw);
  return Result.ok(parsed);
});
```
