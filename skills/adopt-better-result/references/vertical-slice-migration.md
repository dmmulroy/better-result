# Vertical-slice migration

## Choose one complete path

Select the named slice from one failure source through its immediate callers to a handling or transport boundary. Prefer a slice that is valuable, bounded, boundary-heavy, and already testable. Limit signature changes to that propagation path.

## Preserve behavior before changing control flow

Identify existing characterization tests or add them first. Capture success behavior, each known failure, side effects, retries, logging, and user-visible output. If current behavior is unsafe or incorrect, record the intended correction explicitly instead of silently preserving it.

## Implement inside-out

1. Apply the dispositions designed with [`tagged-errors.md`](tagged-errors.md).
2. Wrap throwing or rejecting infrastructure at its narrow boundary with the installed `Result.try` or `Result.tryPromise` API, preserving causes.
3. Replace recoverable failure sentinels and throws with `Result.err`.
4. Change the operation's signature to `Result<T, E>` or `Promise<Result<T, E>>`.
5. Update callers to propagate or handle every error variant. Apply the asynchronous composition preference below when the path returns `Promise<Result<...>>`; use `Result.gen` or combinators for synchronous paths when they make the sequence clearer.
6. Add exhaustive presentation mapping for internal telemetry and safe user messages.
7. Apply the recorded contract from [`result-boundaries.md`](result-boundaries.md) when the path reaches a serialized or untrusted boundary.

Preserve an old external interface with an edge adapter when needed, and record the adapter's removal plan. Mark every seam between Result control flow and legacy throws or sentinels explicitly.

## Compose asynchronous application workflows

Use this order of preference for `Promise<Result<...>>` application code:

1. Prefer `Result.gen` with `Result.await` for workflows with several fallible steps or intermediate values.
2. For a short pipeline, chain static async combinators from the `Result` namespace with `.then(Result.andThenAsync(...))`, `.then(Result.tryRecoverAsync(...))`, or the matching observer combinator.
3. Await the Promise first and call an instance method only when ordinary control-flow narrowing is clearer than composition.

```ts
const dashboard = await Result.gen(async function* () {
  const session = yield* Result.await(readSession());
  const user = yield* Result.await(fetchUser(session.userId));
  const posts = yield* Result.await(fetchPosts(user.id));
  return Result.ok({ user, posts });
});
```

```ts
const postCount = await fetchUser(userId)
  .then(Result.andThenAsync((user: User) => fetchPosts(user.id)))
  .then(Result.map((posts: ReadonlyArray<Post>) => posts.length));
```

Keep expected Promise rejection inside a Result-producing boundary such as `Result.tryPromise`; a raw rejection from an async combinator callback is a defect and becomes `Panic`.

## Test the completed path

A slice requires tests for:

- its success path
- every known tagged failure
- propagation through immediate callers
- developer-facing context and user-safe mapping
- state or side-effect guarantees on failure
- codec success/error round trips and invalid payloads when applicable
- invariant violations that must panic, when practical

The slice is complete when these behaviors are covered from failure source through the selected handling boundary.
