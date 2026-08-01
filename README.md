# better-result

Lightweight Result type for TypeScript with generator-based composition.

[Documentation](https://better-result.dev) · [Quickstart](https://better-result.dev/getting-started/quickstart) · [API reference](https://better-result.dev/reference/result) · [Migrate from 2.x](https://better-result.dev/migration/from-2)

- **Make failures explicit:** TypeScript shows what a function returns when it succeeds and what can go wrong.
- **Write multi-step workflows in order:** `yield*` passes successful values to the next step and stops on the first failure.
- **Keep expected failures separate from bugs:** handle expected failures as normal return values; unexpected exceptions still throw.

```ts
import { Result, TaggedError } from "better-result";

class InvalidPort extends TaggedError("InvalidPort")<{
  input: string;
  message: string;
}> {}

const parsePort = (input: string) => {
  const port = Number(input);
  return Number.isInteger(port) && port > 0 && port <= 65_535
    ? Result.ok(port)
    : Result.err(new InvalidPort({ input, message: "Expected a port from 1 to 65535" }));
};

const message = parsePort(process.env.PORT ?? "3000")
  .map((port) => `http://localhost:${port}`)
  .match({
    ok: (address) => `Listening at ${address}`,
    err: (error) => `Invalid configuration: ${error.message}`,
  });
```

`parsePort` returns `Result<number, InvalidPort>`. Callers cannot use the port until they handle the failure.

## Install

```sh
npm install better-result
```

```sh
pnpm add better-result
# or: bun add better-result
```

better-result is ESM-only and has zero runtime dependencies.

## Contents

- [Mental model](#mental-model)
- [Build a typed workflow](#build-a-typed-workflow)
- [Compose asynchronous workflows](#compose-asynchronous-workflows)
- [Transform and compose Results](#transform-and-compose-results)
- [Recover from errors](#recover-from-errors)
- [Observe without changing a Result](#observe-without-changing-a-result)
- [Extract a value](#extract-a-value)
- [Retry asynchronous operations](#retry-asynchronous-operations)
- [Work with collections](#work-with-collections)
- [Validate transport boundaries](#validate-transport-boundaries)
- [Panic and defects](#panic-and-defects)
- [API map](#api-map)
- [Migrate from 2.x](#migrate-from-2x)
- [Agents and AI](#agents-and-ai)

## Mental model

A `Result<T, E>` is either a successful `Ok<T>` or an expected failure `Err<E>`:

```ts
type Result<T, E> = Ok<T, E> | Err<T, E>;
```

Both variants have a serializable discriminant:

```ts
if (userResult.status === "ok") {
  renderUser(userResult.value); // User
} else {
  reportUserError(userResult.error); // FindUserError
}
```

Static and instance guards are also available:

```ts
if (Result.isOk(userResult)) {
  renderUser(userResult.value);
}

if (userResult.isErr()) {
  reportUserError(userResult.error);
}
```

Use `Err` when the caller can make a meaningful decision about a failure:

- input is invalid;
- a record is missing;
- credentials are rejected;
- an upstream service is unavailable;
- data crossing a transport boundary fails validation.

Unexpected callback failures and broken invariants are defects. better-result represents those with `Panic` instead of silently widening a typed error union with `unknown`.

A useful Result boundary has a caller that can act on the error. Parsers, repositories, adapters, domain operations, and application workflows are good candidates. Pure, total helpers usually are not.

## Build a typed workflow

This checkout workflow shows the normal path: define errors, return Results, compose operations, and handle the complete error union.

### Define errors callers can distinguish

`TaggedError` creates real `Error` subclasses with a literal `_tag` and typed properties:

```ts
import { Result, TaggedError, type Result as ResultType } from "better-result";

class CartNotFound extends TaggedError("CartNotFound")<{
  cartId: string;
  message: string;
}> {}

class EmptyCart extends TaggedError("EmptyCart")<{
  cartId: string;
  message: string;
}> {}

class OutOfStock extends TaggedError("OutOfStock")<{
  sku: string;
  message: string;
}> {}

class PaymentDeclined extends TaggedError("PaymentDeclined")<{
  reason: string;
  message: string;
}> {}
```

Tagged errors include normal `Error` behavior, readonly payload properties, `.toJSON()`, a class-level `.is()` guard, exhaustive `.match()`, and generator support.

```ts
const error = new CartNotFound({
  cartId: "cart_123",
  message: "Cart cart_123 was not found",
});

if (CartNotFound.is(error)) {
  console.log(error.cartId);
}
```

### Return Results from fallible operations

```ts
type Cart = {
  id: string;
  items: ReadonlyArray<{ sku: string; quantity: number }>;
};

const carts = new Map<string, Cart>();

const findCart = (cartId: string): ResultType<Cart, CartNotFound> => {
  const cart = carts.get(cartId);
  return cart === undefined
    ? Result.err(new CartNotFound({ cartId, message: "Cart not found" }))
    : Result.ok(cart);
};
```

The error type is part of the function's contract. A caller must propagate, recover from, or handle `CartNotFound`.

### Compose linearly with `Result.gen`

Assume the application also provides these Result-returning operations:

```ts
reserveStock(cart.items); // Result<StockReservation, OutOfStock>
chargePayment(cart, reservation); // Result<Receipt, PaymentDeclined>
```

`Result.gen` composes them without nested callbacks or manual early returns:

```ts
const checkout = (cartId: string) =>
  Result.gen(function* () {
    const cart = yield* findCart(cartId);

    if (cart.items.length === 0) {
      yield* new EmptyCart({ cartId, message: "Cannot check out an empty cart" });
    }

    const reservation = yield* reserveStock(cart.items);
    const receipt = yield* chargePayment(cart, reservation);

    return Result.ok(receipt);
  });
// Result<Receipt, CartNotFound | EmptyCart | OutOfStock | PaymentDeclined>
```

Every `Ok` is unwrapped. The first `Err` short-circuits the generator. Errors from all yielded Results are collected into the final union.

A tagged error can be yielded directly for a guard clause. This is equivalent to `yield* Result.err(new EmptyCart(...))`; it returns an `Err` and does not throw.

### Handle the complete error union

Use `Result.match` to handle success versus failure, then match the tagged error union:

```ts
const response = checkout(cartId).match({
  ok: (receipt) => Response.json(receipt, { status: 201 }),
  err: (error) =>
    error.match({
      CartNotFound: () => Response.json({ message: "Cart not found" }, { status: 404 }),
      EmptyCart: () => Response.json({ message: "Cart is empty" }, { status: 400 }),
      OutOfStock: (error) =>
        Response.json({ message: `Out of stock: ${error.sku}` }, { status: 409 }),
      PaymentDeclined: () => Response.json({ message: "Payment declined" }, { status: 402 }),
    }),
});
```

Adding another tagged error to `checkout` makes this exhaustive handler fail to type-check until the new policy is defined.

Use [`matchError`](https://better-result.dev/errors/matching-errors) when errors are structurally tagged or when data-last composition is more convenient. Use `matchErrorPartial` when selected variants should be transformed and unhandled variants should pass through.

## Compose asynchronous workflows

Prefer `Result.gen` with `Result.await` for multi-step asynchronous workflows. It keeps intermediate values local, short-circuits on the first `Err`, and preserves every yielded error type:

```ts
const dashboard = await Result.gen(async function* () {
  const session = yield* Result.await(readSession());
  const user = yield* Result.await(fetchUser(session.userId));
  const posts = yield* Result.await(fetchPosts(user.id));

  return Result.ok({ user, posts });
});
// Result<Dashboard, SessionExpired | UserNotFound | FetchPostsFailed>
```

`Result.await` provides the async iterator protocol needed by the generator while preserving the Promise's Result types.

For a short pipeline, chain the Promise with static, data-last combinators from the `Result` namespace:

```ts
const postCount = await fetchUser(userId)
  .then(Result.andThenAsync((user: User) => fetchPosts(user.id)))
  .then(Result.map((posts: ReadonlyArray<Post>) => posts.length));
// Result<number, UserNotFound | FetchPostsFailed>
```

`Promise.then` unwraps each outer Promise. `Result.andThenAsync` runs `fetchPosts` only for `Ok`, and `Result.map` transforms the eventual success while both errors remain visible.

Use this order of preference for asynchronous Result code:

1. `Result.gen` with `Result.await` for workflows with several steps or intermediate values;
2. `.then(Result.andThenAsync(...))` and other static combinators for short Promise pipelines;
3. await a `Promise<Result>` first only when ordinary control-flow narrowing is clearer than composition.

`Result.gen` closes a short-circuited generator, so `finally`, `Symbol.dispose`, and `Symbol.asyncDispose` cleanup can run. See [Generator composition](https://better-result.dev/core/generator-composition) for cleanup and defect behavior.

## Transform and compose Results

Use each operation on the branch it owns:

| Operation          | Runs on         | Purpose                                          |
| ------------------ | --------------- | ------------------------------------------------ |
| `map`              | `Ok`            | Transform a success value                        |
| `mapError`         | `Err`           | Translate an error value                         |
| `andThen`          | `Ok`            | Continue with another Result-returning operation |
| `tryRecover`       | `Err`           | Recover from or replace an error                 |
| `tap` / `tapError` | Selected branch | Observe without changing the Result              |
| `match`            | Both            | Leave the Result abstraction with one output     |

For example, a profile workflow can keep its errors visible while changing the success value:

```ts
const displayName = findUser(userId)
  .map((user) => user.profile)
  .andThen(validateUserProfile)
  .map((profile) => profile.displayName)
  .mapError((cause) => new LoadProfileFailed({ cause, message: "Could not load user profile" }));
// Result<string, LoadProfileFailed>
```

`andThen` unions errors when the next operation introduces another failure type:

```ts
const greeting = findUser(userId).andThen((user) => loadGreeting(user.locale));
// Result<Greeting, UserNotFound | GreetingLoadFailed>
```

Combinators are available as instance methods and as static data-first or data-last functions:

```ts
const upperName = Result.map(userResult, (user) => user.name.toUpperCase());

const getUpperName = Result.map((user: User) => user.name.toUpperCase());
const pipedName = getUpperName(userResult);
```

See [Transforming and chaining](https://better-result.dev/core/transforming-and-chaining) for the complete sync and async contracts.

## Recover from errors

Recovery is different from error transformation: the callback returns another Result and may produce a usable success value.

A cache fallback can recover from a network failure while preserving all other variants:

```ts
const user = await fetchUser(userId).then(
  Result.tryRecoverAsync(async (error: FetchUserError) =>
    error._tag === "NetworkUnavailable" ? await readCachedUser(userId) : Result.err(error),
  ),
);
// Result<User, UserNotFound | CacheMiss>
```

Recovery may widen the success type when the fallback returns a different value:

```ts
const userOrGuest = findUser(userId).tryRecover((error) =>
  UserNotFound.is(error) ? Result.ok(guestUser) : Result.err(error),
);
// Result<User | GuestUser, DatabaseUnavailable>
```

Use `tryRecoverAsync` when recovery itself is asynchronous.

## Observe without changing a Result

Observation methods are useful for logging, metrics, and tracing. They always preserve the original Result.

```ts
const tracedUser = await fetchUser(userId).then(
  Result.tapBothAsync({
    ok: (user: User) => trace("user.loaded", { userId: user.id }),
    err: (error: FetchUserError) => trace("user.load_failed", { tag: error._tag }),
  }),
);
```

The complete family is:

- `tap` and `tapAsync` observe `Ok`;
- `tapError` and `tapErrorAsync` observe `Err`;
- `tapBoth` and `tapBothAsync` select an observer for either branch.

```ts
const result = parseConfiguration(input)
  .tap((configuration) => console.info("Configuration loaded", configuration))
  .tapError((error) => console.error("Configuration rejected", error));
```

A throwing or rejected observer is a defect and becomes `Panic`.

## Extract a value

Prefer `match` when both branches require explicit policy:

```ts
const response = userResult.match({
  ok: (user) => Response.json(user, { status: 200 }),
  err: (error) => toUserErrorResponse(error),
});
```

Use `unwrapOr` when a fallback is the complete error policy:

```ts
const port = parsePort(process.env.PORT ?? "").unwrapOr(3000);
```

Static data-first and data-last forms are also available:

```ts
Result.unwrapOr(parsePort(input), 3000);
Result.unwrapOr(3000)(parsePort(input));
```

Use `unwrap` only to assert that `Err` would prove a broken invariant:

```ts
const configuration = loadStartupConfiguration().unwrap("Startup configuration must be valid");
```

On `Err`, `unwrap` throws `Panic` and preserves the error value as its cause. It is not a substitute for handling routine failures.

See [Extracting values](https://better-result.dev/core/extracting-values) for the full contract.

## Retry asynchronous operations

`Result.tryPromise` captures Promise rejection. The object form translates unknown rejection values into a typed error:

```ts
class NetworkError extends TaggedError("NetworkError")<{
  cause: unknown;
  url: string;
  retryable: boolean;
  message: string;
}> {}

const controller = new AbortController();

const responseResultPromise = Result.tryPromise(
  {
    try: ({ signal }) => fetch(url, { signal }),
    catch: (cause) =>
      new NetworkError({
        cause,
        url,
        retryable: cause instanceof TypeError,
        message: "Network request failed",
      }),
  },
  {
    signal: controller.signal,
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential",
      jitter: true,
      shouldRetry: (error) => error.retryable,
    },
  },
);
```

`times` is the maximum number of retries after the initial attempt. Retry scheduling is bounded, and the top-level signal interrupts pending delays.

`Result.tryPromise` cannot cancel an operation by itself. Forward its signal to cancellation-aware operations, as the example does with `fetch`.

A fulfilled HTTP error response does not reject. Handle HTTP status explicitly:

```ts
class HttpResponseError extends TaggedError("HttpResponseError")<{
  status: number;
  url: string;
  message: string;
}> {}

const successfulResponse = await responseResultPromise.then(
  Result.andThen((response: Response) =>
    response.ok
      ? Result.ok(response)
      : Result.err(
          new HttpResponseError({
            status: response.status,
            url: response.url,
            message: `Request failed with status ${response.status}`,
          }),
        ),
  ),
);
// Result<Response, NetworkError | HttpResponseError>
```

Retry policies also support attempt context, constant and linear backoff, dynamic error-dependent delays, and configurable jitter. See [Async operations and retries](https://better-result.dev/core/async-and-retries) for exact semantics.

## Work with collections

Use `Result.all` when every operation must succeed:

```ts
const accountContext = Result.all([
  loadCachedUser(userId),
  loadCachedTeam(teamId),
  loadCachedPlan(accountId),
] as const);
// Result<[User, Team, Plan], UserLoadError | TeamLoadError | PlanLoadError>
```

`Result.allAsync` awaits inputs concurrently, then returns all successes or the first input-order error:

```ts
const accountContext = await Result.allAsync([
  fetchUser(userId),
  fetchTeam(teamId),
  fetchPlan(accountId),
] as const);
```

Use `Result.partition` when every item should be processed:

```ts
const validationResults = importRows.map(validateImportRow);
const [validRows, invalidRowErrors] = Result.partition(validationResults);
```

`partition` preserves the relative order of every success and error instead of short-circuiting. `partitionAsync` provides the concurrent asynchronous form.

Use `Result.flatten` when a nested Result already exists:

```ts
const flattened = Result.flatten(nestedUserResult);
// Result<User, ParseUserError | LoadUserError>
```

See [Collections](https://better-result.dev/core/collections) for tuple inference, ordering, and rejected-Promise behavior.

## Validate transport boundaries

`Result.codec` validates and transforms Result values crossing RPC, persistence, queue, or server-action boundaries. It accepts any [Standard Schema](https://standardschema.dev/)-compatible schema library.

Pass four named, boundary-owned schemas to the codec. Keep validation and domain/wire mapping inside those schemas rather than defining it inline in `Result.codec`:

```ts
import { Result, ResultDeserializationError, ResultSerializationError } from "better-result";

const UserResultCodec = Result.codec({
  serialize: {
    ok: UserToWireSchema,
    err: DomainErrorToWireSchema,
  },
  deserialize: {
    ok: UserFromWireSchema,
    err: DomainErrorFromWireSchema,
  },
});
```

Serialize a Result into a validated plain-object envelope:

```ts
const encoded = await UserResultCodec.serialize(Result.ok(user));
// Result<SerializedResult<UserWire, ErrorWire>, ResultSerializationError>

if (Result.isError(encoded) && ResultSerializationError.is(encoded.error)) {
  console.error("Could not serialize user Result", encoded.error.issues);
}
```

Deserialize untrusted input back into validated domain values:

```ts
const decoded = await UserResultCodec.deserialize(inputFromNetwork);
// Result<User, DomainError | ResultDeserializationError>

if (Result.isError(decoded) && ResultDeserializationError.is(decoded.error)) {
  console.error("Invalid serialized Result", decoded.error.issues);
}
```

The codec validates the outer `{ status, value | error }` envelope and the selected payload. In-memory and wire types can differ in both directions. A schema issue returns `ResultSerializationError` or `ResultDeserializationError`; a schema that throws or rejects is a defect and produces `Panic`.

See [Result codecs](https://better-result.dev/serialization/result-codecs) for mixed synchronous/asynchronous schemas and exact return-type inference.

## Panic and defects

`Err` represents an expected failure in the function's contract. `Panic` represents a defect that ordinary callers should not recover from.

If a user callback unexpectedly throws, better-result throws `Panic` rather than adding `unknown` to the Result's error type:

```ts
Result.ok(user).map(() => {
  throw new Error("Broken user invariant");
});
// throws Panic
```

This protection applies to transforms, chaining, matching, recovery, observers, generators, custom catch handlers, and codec validation.

Catch `Panic` at reporting or supervision boundaries:

```ts
import { Panic } from "better-result";

try {
  runApplication();
} catch (error) {
  if (Panic.is(error)) {
    reportDefect(error.message, error.cause);
  }
}
```

`isPanic(error)` and `error instanceof Panic` are also supported. `Panic.cause` preserves the original thrown value.

See [Panic and defects](https://better-result.dev/errors/panic-and-defects) for callback boundaries, generator cleanup, and reporting behavior.

## API map

The [complete API reference](https://better-result.dev/reference/result) is the source of truth for signatures and overloads.

| Intent                 | APIs                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Create                 | `Result.ok`, `Result.err`, `Result.try`, `Result.tryPromise`                                                |
| Narrow and handle      | `Result.isOk`, `Result.isError`, `match`, `unwrapOr`, `unwrap`                                              |
| Transform and compose  | `map`, `mapError`, `andThen`, `andThenAsync`, `tryRecover`, `tryRecoverAsync`, `Result.gen`, `Result.await` |
| Observe                | `tap`, `tapAsync`, `tapError`, `tapErrorAsync`, `tapBoth`, `tapBothAsync`                                   |
| Collect                | `Result.all`, `Result.allAsync`, `Result.partition`, `Result.partitionAsync`, `Result.flatten`              |
| Typed errors           | `TaggedError`, `matchError`, `matchErrorPartial`, `isTaggedError`                                           |
| Boundaries and defects | `Result.codec`, `Panic`, `panic`, `isPanic`, `UnhandledException`                                           |

### Public types

| Type                                | Purpose                                       |
| ----------------------------------- | --------------------------------------------- |
| `Result<T, E>`                      | Union of `Ok<T, E>` and `Err<T, E>`           |
| `InferOk<R>`                        | Extract the success type from a Result        |
| `InferErr<R>`                       | Extract the error type from a Result          |
| `TryContext`                        | Synchronous attempt context                   |
| `TryPromiseContext`                 | Asynchronous attempt and abort-signal context |
| `ResultCodec` / `ResultCodecConfig` | Result codec contracts                        |
| `SerializedResult<T, E>`            | Plain-object Result envelope                  |
| `StandardSchemaV1`                  | Standard Schema-compatible validator contract |
| `AnyTaggedError`                    | Any better-result tagged error instance       |

See [Ok and Err](https://better-result.dev/reference/ok-and-err), [exported types](https://better-result.dev/reference/exported-types), and [error APIs](https://better-result.dev/reference/errors) for detailed contracts.

## Migrate from 2.x

Read the full [2.x to 3.0 migration guide](https://better-result.dev/migration/from-2) before upgrading.

The most important breaking changes are:

1. `TaggedError("Tag")<Props>` no longer has a trailing factory call.
2. `Result.serialize`, `Result.deserialize`, and `Result.hydrate` were replaced by schema-backed `Result.codec` boundaries.
3. `match` is reserved on `TaggedError` instances.

```ts
// 2.x
class UserNotFound extends TaggedError("UserNotFound")<{ userId: string; message: string }>() {}

// 3.0
class UserNotFound extends TaggedError("UserNotFound")<{ userId: string; message: string }> {}
```

3.0 also adds widening recovery, direct tagged-error matching, collection helpers, cancellation-aware retries, dynamic retry delays, and richer observation APIs.

## Agents and AI

The portable [`adopt-better-result`](skills/adopt-better-result/SKILL.md) skill guides compatible coding agents through a repository-wide error-handling audit or one approved vertical migration slice.

Install it with skills.sh-compatible tooling:

```sh
npx skills add dmmulroy/better-result@adopt-better-result
```

See [`skills/README.md`](skills/README.md) for manual installation and usage.

## Documentation

- [Documentation home](https://better-result.dev)
- [Mental model](https://better-result.dev/getting-started/mental-model)
- [Application patterns](https://better-result.dev/guides/application-patterns)
- [Testing Results](https://better-result.dev/guides/testing)
- [API reference](https://better-result.dev/reference/result)
- [Issue tracker](https://github.com/dmmulroy/better-result/issues)

## License

[MIT](LICENSE)
