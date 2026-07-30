# Audited 2.10.0 → 3.0 API diff

This reference is derived from the public source and tests between `v2.10.0` and the `3.0` branch at `a43cead`. Verify the installed target declarations when migrating to a later 3.x release.

## Required source changes

### TaggedError factory

The empty call after the props type is removed.

```ts
// 2.x
class ApiError extends TaggedError("ApiError")<{
  status: number;
  message: string;
}>() {}

// 3.0
class ApiError extends TaggedError("ApiError")<{
  status: number;
  message: string;
}> {}
```

Construction remains object-based: `new ApiError({ status, message })`. Custom constructors continue to call `super(props)`. `TaggedError.is(value)` still checks any tagged error, while `ApiError.is(value)` now narrows to that concrete subclass more accurately.

The exported class helper changed from `TaggedErrorClass<Tag, Props>` to `TaggedErrorClass<Tag>`. The resulting base class is generic in props, so reusable bases can use this shape:

```ts
const HttpError = TaggedError("HttpError");
class NotFoundError extends HttpError<{ resource: string; message: string }> {}
```

### Result serialization

`Result.serialize`, `Result.deserialize`, and deprecated `Result.hydrate` are removed. `Result.codec(config)` replaces them with Standard Schema validation for the Ok and Err payloads in each direction. Follow [result-codec-migration.md](result-codec-migration.md) for boundary design and error handling.

The plain envelope types `SerializedResult`, `SerializedOk`, and `SerializedErr` remain exported. They describe wire shapes; they do not validate or hydrate unknown values.

## Inference changes to review

### Recovery may widen success

Both static and instance forms of `tryRecover` and `tryRecoverAsync` now allow a recovered success type `B` different from the original `A`.

```ts
const recovered = result.tryRecover(() => Result.ok("fallback"));
// Result<A | string, NewError>
```

On an `Ok`, the callback remains uncalled and the original `A` survives. On a concrete `Err`, recovery returns `Result<B, NewError>`. Remove workarounds that coerced recovery back to `A`, then ensure downstream code handles the honest `A | B` union.

### Tagged-error matching

`matchError` infers the union of independent handler returns; explicit `<ErrorUnion, Return>` parameters still constrain all handlers to one return type.

`matchErrorPartial` also unions handler and fallback returns. Its fallback is now optional. Without one, handled variants are transformed and unhandled variants pass through unchanged:

```ts
const output = matchErrorPartial(error, {
  NotFoundError: () => "missing" as const,
});
// "missing" | remaining error variants
```

In pipeable recovery code, pass `Result.err` when unhandled variants must remain in the Result error channel:

```ts
const recoverNotFound = matchErrorPartial(
  { NotFoundError: (error: NotFoundError) => Result.ok(error.cachedValue) },
  Result.err,
);
```

Existing three-argument data-first and two-argument pipeable calls with a fallback remain supported.

### Partition typing

`Result.partition` still returns `[okValues, errValues]`, but now accepts heterogeneous tuples/arrays and infers unions for both arrays. Review exact type assertions that depended on a homogeneous signature.

## Additive 3.0 APIs

These additions require no migration unless the codebase chooses to adopt them.

### Validated codecs and errors

- `Result.codec(config)`
- `ResultSerializationError`
- `ResultDeserializationError` now optionally carries Standard Schema `issues`
- `ResultCodec`, `ResultCodecConfig`, `ResultCodecIssue`, and Standard Schema helper types

### Result collections

- `Result.all(results)` collects all Ok values in tuple order or returns the first Err in input order.
- `Result.allAsync(results)` concurrently accepts Results and promises, then uses input order; a rejected input promise throws `Panic`.
- `Result.partitionAsync(results)` concurrently partitions Results and promises in input order; a rejected input promise throws `Panic`.

### Async retry controls

`Result.tryPromise` callbacks now receive `TryPromiseContext`, which extends the 1-based `{ attempt }` context with `signal?: AbortSignal`. Synchronous `Result.try` continues to receive `TryContext` without a signal.

A top-level `signal` is forwarded to every attempt and retry decision. Aborting interrupts retry delays and prevents later attempts, but the callback must pass the signal to an abort-aware operation to cancel in-flight work. The latest typed error is returned when retrying stops.

`shouldRetry(error, context)` may use the failed attempt and signal. A dynamic `delayMs(error, context)` is supported, but it cannot be combined with `backoff` or `jitter`. Static delays retain required `backoff` and may add `jitter: boolean | number`; numeric jitter must be finite and between 0 and 1. Retry callbacks remain synchronous and throw `Panic` on defects.

A valid v2 static retry object remains valid in 3.0:

```ts
{
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "exponential",
    shouldRetry: (error) => error.retryable,
  },
}
```
