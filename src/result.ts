import { panic, UnhandledException } from "./error";
import { dual } from "./dual";

/** Executes fn, panics if it throws. */
const tryOrPanic = <T>(fn: () => T, message: string): T => {
  try {
    return fn();
  } catch (cause) {
    throw panic(message, cause);
  }
};

/** Async version of tryOrPanic. */
const tryOrPanicAsync = async <T>(fn: () => Promise<T>, message: string): Promise<T> => {
  try {
    return await fn();
  } catch (cause) {
    throw panic(message, cause);
  }
};

/**
 * Successful result variant.
 *
 * @template A Success value type.
 * @template E Error type (phantom - for type unification).
 *
 * @example
 * const result = new Ok(42);
 * result.value // 42
 * result.status // "ok"
 */
export class Ok<A, E = never> {
  readonly status = "ok" as const;
  constructor(readonly value: A) {}

  /**
   * Transforms success value.
   *
   * @template B Transformed type.
   * @param fn Transformation function.
   * @returns Ok with transformed value.
   * @throws {Panic} If fn throws.
   *
   * @example
   * ok(2).map(x => x * 2) // Ok(4)
   */
  map<B>(fn: (a: A) => B): Ok<B, E> {
    return tryOrPanic(() => new Ok<B, E>(fn(this.value)), "map callback threw");
  }

  /**
   * No-op on Ok, returns self with new phantom error type.
   *
   * @template E2 New error type.
   * @param _fn Ignored.
   * @returns Self with updated phantom E type.
   */
  mapError<E2>(_fn: (e: never) => E2): Ok<A, E2> {
    // SAFETY: E is phantom on Ok (not used at runtime).
    return this as unknown as Ok<A, E2>;
  }

  /**
   * Chains Result-returning function.
   *
   * @template B New success type.
   * @template E2 New error type.
   * @param fn Function returning Result.
   * @returns Result from fn.
   * @throws {Panic} If fn throws.
   *
   * @example
   * ok(2).andThen(x => x > 0 ? ok(x) : err("negative")) // Ok(2)
   */
  andThen<B, E2>(fn: (a: A) => Result<B, E2>): Result<B, E | E2> {
    return tryOrPanic(() => fn(this.value), "andThen callback threw");
  }

  /**
   * Chains async Result-returning function.
   *
   * @template B New success type.
   * @template E2 New error type.
   * @param fn Async function returning Result.
   * @returns Promise of Result from fn.
   * @throws {Panic} If fn throws synchronously or rejects.
   *
   * @example
   * await ok(1).andThenAsync(async x => ok(await fetchData(x)))
   */
  andThenAsync<B, E2>(fn: (a: A) => Promise<Result<B, E2>>): Promise<Result<B, E | E2>> {
    return tryOrPanicAsync(() => fn(this.value), "andThenAsync callback threw");
  }

  /**
   * Pattern matches on Result.
   *
   * @template T Return type.
   * @param handlers Ok and err handlers.
   * @returns Result of ok handler.
   * @throws {Panic} If handler throws.
   *
   * @example
   * ok(2).match({ ok: x => x * 2, err: () => 0 }) // 4
   */
  match<T>(handlers: { ok: (a: A) => T; err: (e: never) => T }): T {
    return tryOrPanic(() => handlers.ok(this.value), "match ok handler threw");
  }

  /**
   * Extracts value.
   *
   * @param _message Ignored.
   * @returns The value.
   *
   * @example
   * ok(42).unwrap() // 42
   */
  unwrap(_message?: string): A {
    return this.value;
  }

  /**
   * Returns value, ignoring fallback.
   *
   * @template B Fallback type.
   * @param _fallback Ignored.
   * @returns The value.
   *
   * @example
   * ok(42).unwrapOr(0) // 42
   */
  unwrapOr<B>(_fallback: B): A {
    return this.value;
  }

  /**
   * Runs side effect, returns self.
   *
   * @param fn Side effect function.
   * @returns Self.
   * @throws {Panic} If fn throws.
   *
   * @example
   * ok(2).tap(console.log).map(x => x * 2) // logs 2, returns Ok(4)
   */
  tap(fn: (a: A) => void): Ok<A, E> {
    return tryOrPanic(() => {
      fn(this.value);
      return this;
    }, "tap callback threw");
  }

  /**
   * Runs async side effect, returns self.
   *
   * @param fn Async side effect function.
   * @returns Promise of self.
   * @throws {Panic} If fn throws synchronously or rejects.
   *
   * @example
   * await ok(2).tapAsync(async x => await log(x))
   */
  tapAsync(fn: (a: A) => Promise<void>): Promise<Ok<A, E>> {
    return tryOrPanicAsync(async () => {
      await fn(this.value);
      return this;
    }, "tapAsync callback threw");
  }

  /**
   * Makes Ok yieldable in Result.gen blocks.
   * Immediately returns the value without yielding.
   * Yield type Err<never, E> matches Err's for proper union inference.
   */
  // oxlint-disable-next-line require-yield
  *[Symbol.iterator](): Generator<Err<never, E>, A, unknown> {
    return this.value;
  }
}

/**
 * Error result variant.
 *
 * @template T Success type (phantom - for type unification with Ok).
 * @template E Error value type.
 *
 * @example
 * const result = new Err("failed");
 * result.error // "failed"
 * result.status // "error"
 */
export class Err<T, E> {
  readonly status = "error" as const;
  constructor(readonly error: E) {}

  /**
   * No-op on Err, returns self with new phantom T.
   *
   * @template U New phantom success type.
   * @param _fn Ignored.
   * @returns Self.
   */
  map<U>(_fn: (a: T) => U): Err<U, E> {
    // SAFETY: T is phantom (not used at runtime). Err only holds `error: E`.
    return this as unknown as Err<U, E>;
  }

  /**
   * Transforms error value.
   *
   * @template E2 Transformed error type.
   * @param fn Transformation function.
   * @returns Err with transformed error.
   * @throws {Panic} If fn throws.
   *
   * @example
   * err("fail").mapError(e => new Error(e)) // Err(Error("fail"))
   */
  mapError<E2>(fn: (e: E) => E2): Err<T, E2> {
    return tryOrPanic(() => new Err<T, E2>(fn(this.error)), "mapError callback threw");
  }

  /**
   * No-op on Err, returns self with widened error type.
   *
   * @template U New phantom success type.
   * @template E2 Additional error type.
   * @param _fn Ignored.
   * @returns Self.
   */
  andThen<U, E2>(_fn: (a: T) => Result<U, E2>): Err<U, E | E2> {
    // SAFETY: T is phantom, E⊂(E|E2) so error type widens safely.
    return this as unknown as Err<U, E | E2>;
  }

  /**
   * No-op on Err, returns Promise of self with widened error type.
   *
   * @template U New phantom success type.
   * @template E2 Additional error type.
   * @param _fn Ignored.
   * @returns Promise of self.
   */
  andThenAsync<U, E2>(_fn: (a: T) => Promise<Result<U, E2>>): Promise<Err<U, E | E2>> {
    // SAFETY: T is phantom, E⊂(E|E2) so error type widens safely.
    return Promise.resolve(this as unknown as Err<U, E | E2>);
  }

  /**
   * Pattern matches on Result.
   *
   * @template R Return type.
   * @param handlers Ok and err handlers.
   * @returns Result of err handler.
   * @throws {Panic} If handler throws.
   *
   * @example
   * err("fail").match({ ok: x => x, err: e => e.length }) // 4
   */
  match<R>(handlers: { ok: (a: T) => R; err: (e: E) => R }): R {
    return tryOrPanic(() => handlers.err(this.error), "match err handler threw");
  }

  /**
   * Throws error with optional message.
   *
   * @param message Error message.
   * @throws Always throws.
   *
   * @example
   * err("fail").unwrap() // throws Error
   * err("fail").unwrap("custom") // throws Error("custom")
   */
  unwrap(message?: string): never {
    throw new Error(message ?? `Unwrap called on Err: ${String(this.error)}`);
  }

  /**
   * Returns fallback value.
   *
   * @template U Fallback type.
   * @param fallback Fallback value.
   * @returns Fallback.
   *
   * @example
   * err("fail").unwrapOr(42) // 42
   */
  unwrapOr<U>(fallback: U): T | U {
    return fallback;
  }

  /**
   * No-op on Err, returns self.
   *
   * @param _fn Ignored.
   * @returns Self.
   */
  tap(_fn: (a: T) => void): Err<T, E> {
    return this;
  }

  /**
   * No-op on Err, returns Promise of self.
   *
   * @param _fn Ignored.
   * @returns Promise of self.
   */
  tapAsync(_fn: (a: T) => Promise<void>): Promise<Err<T, E>> {
    return Promise.resolve(this);
  }

  /**
   * Makes Err yieldable in Result.gen blocks.
   * Yields Err<never, E> for proper union inference across multiple yields.
   */
  *[Symbol.iterator](): Generator<Err<never, E>, T, unknown> {
    // SAFETY: T is phantom (not used at runtime). Casting to Err<never, E>
    // ensures all yields have phantom T as `never`, enabling TypeScript to
    // unify: Err<never, E1> | Err<never, E2> extracts to E1 | E2
    yield this as unknown as Err<never, E>;
    throw new Error("Unreachable: Err yielded in Result.gen but generator continued");
  }
}

/**
 * Discriminated union representing operation success or failure.
 *
 * Both Ok and Err carry phantom types for the "other" variant:
 * - Ok<T, E>: T is value, E is phantom error type
 * - Err<T, E>: T is phantom success type, E is error
 *
 * This symmetric structure enables proper type inference in generator-based composition.
 *
 * @template T Success value type.
 * @template E Error value type.
 *
 * @example
 * type ParseResult = Result<number, ParseError>;
 */
export type Result<T, E> = Ok<T, E> | Err<T, E>;

/**
 * Extracts error type E from yield union in Result.gen.
 * Yields are always Err<never, E>, so we match on that pattern.
 * Distributive conditional: InferYieldErr<Err<never, A> | Err<never, B>> = A | B
 */
type InferYieldErr<Y> = Y extends Err<never, infer E> ? E : never;

/**
 * Infer the Ok value type from a Result.
 * Distributive: InferOk<Ok<A, X> | Ok<B, Y>> = A | B
 */
export type InferOk<R> = R extends Ok<infer T, unknown> ? T : never;

/**
 * Infer the Err value type from a Result.
 * Distributive: InferErr<Err<X, A> | Err<Y, B>> = A | B
 */
export type InferErr<R> = R extends Err<unknown, infer E> ? E : never;

/**
 * Constraint for any union of Ok/Err types.
 * Used in Result.gen to accept flexible return types from generators.
 */
type AnyResult = Ok<unknown, unknown> | Err<unknown, unknown>;

const ok = <A, E = never>(value: A): Ok<A, E> => new Ok<A, E>(value);

const isOk = <A, E>(result: Result<A, E>): result is Ok<A, E> => {
  return result.status === "ok";
};

const err = <T = never, E = unknown>(error: E): Err<T, E> => new Err<T, E>(error);

const isError = <T, E>(result: Result<T, E>): result is Err<T, E> => {
  return result.status === "error";
};

const tryFn: {
  <A>(thunk: () => A, config?: { retry?: { times: number } }): Result<A, UnhandledException>;
  <A, E>(
    options: { try: () => A; catch: (cause: unknown) => E },
    config?: { retry?: { times: number } },
  ): Result<A, E>;
} = <A, E>(
  options: (() => A) | { try: () => A; catch: (cause: unknown) => E },
  config?: { retry?: { times: number } },
): Result<A, E | UnhandledException> => {
  const execute = (): Result<A, E | UnhandledException> => {
    if (typeof options === "function") {
      try {
        return ok(options());
      } catch (cause) {
        return err(new UnhandledException({ cause }));
      }
    }
    try {
      return ok(options.try());
    } catch (originalCause) {
      // If the user's catch handler throws, it's a defect — Panic
      try {
        return err(options.catch(originalCause));
      } catch (catchHandlerError) {
        throw panic("Result.try catch handler threw", catchHandlerError);
      }
    }
  };

  const times = config?.retry?.times ?? 0;
  let result = execute();

  for (let retry = 0; retry < times && result.status === "error"; retry++) {
    result = execute();
  }

  return result;
};

type RetryConfig = {
  retry?: {
    times: number;
    delayMs: number;
    backoff: "linear" | "constant" | "exponential";
  };
};

const tryPromise: {
  <A>(thunk: () => Promise<A>, config?: RetryConfig): Promise<Result<A, UnhandledException>>;
  <A, E>(
    options: { try: () => Promise<A>; catch: (cause: unknown) => E },
    config?: RetryConfig,
  ): Promise<Result<A, E>>;
} = async <A, E>(
  options: (() => Promise<A>) | { try: () => Promise<A>; catch: (cause: unknown) => E },
  config?: RetryConfig,
): Promise<Result<A, E | UnhandledException>> => {
  const execute = async (): Promise<Result<A, E | UnhandledException>> => {
    if (typeof options === "function") {
      try {
        return ok(await options());
      } catch (cause) {
        return err(new UnhandledException({ cause }));
      }
    }
    try {
      return ok(await options.try());
    } catch (originalCause) {
      // If the user's catch handler throws, it's a defect — Panic
      try {
        return err(options.catch(originalCause));
      } catch (catchHandlerError) {
        throw panic("Result.tryPromise catch handler threw", catchHandlerError);
      }
    }
  };

  const retry = config?.retry;

  if (!retry) {
    return execute();
  }

  const getDelay = (retryAttempt: number): number => {
    switch (retry.backoff) {
      case "constant":
        return retry.delayMs;
      case "linear":
        return retry.delayMs * (retryAttempt + 1);
      case "exponential":
        return retry.delayMs * 2 ** retryAttempt;
    }
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  let result = await execute();

  for (let attempt = 0; attempt < retry.times && result.status === "error"; attempt++) {
    await sleep(getDelay(attempt));
    result = await execute();
  }

  return result;
};

const map: {
  <A, B, E>(result: Result<A, E>, fn: (a: A) => B): Result<B, E>;
  <A, B>(fn: (a: A) => B): <E>(result: Result<A, E>) => Result<B, E>;
} = dual(2, <A, B, E>(result: Result<A, E>, fn: (a: A) => B): Result<B, E> => {
  return result.map(fn);
});

const mapError: {
  <A, E, E2>(result: Result<A, E>, fn: (e: E) => E2): Result<A, E2>;
  <E, E2>(fn: (e: E) => E2): <A>(result: Result<A, E>) => Result<A, E2>;
} = dual(2, <A, E, E2>(result: Result<A, E>, fn: (e: E) => E2): Result<A, E2> => {
  return result.mapError(fn);
});

const andThen: {
  <A, B, E, E2>(result: Result<A, E>, fn: (a: A) => Result<B, E2>): Result<B, E | E2>;
  <A, B, E2>(fn: (a: A) => Result<B, E2>): <E>(result: Result<A, E>) => Result<B, E | E2>;
} = dual(2, <A, B, E, E2>(result: Result<A, E>, fn: (a: A) => Result<B, E2>): Result<B, E | E2> => {
  return result.andThen(fn);
});

const andThenAsync: {
  <A, B, E, E2>(
    result: Result<A, E>,
    fn: (a: A) => Promise<Result<B, E2>>,
  ): Promise<Result<B, E | E2>>;
  <A, B, E2>(
    fn: (a: A) => Promise<Result<B, E2>>,
  ): <E>(result: Result<A, E>) => Promise<Result<B, E | E2>>;
} = dual(
  2,
  <A, B, E, E2>(
    result: Result<A, E>,
    fn: (a: A) => Promise<Result<B, E2>>,
  ): Promise<Result<B, E | E2>> => {
    return result.andThenAsync(fn);
  },
);

const match: {
  <A, E, T>(result: Result<A, E>, handlers: { ok: (a: A) => T; err: (e: E) => T }): T;
  <A, E, T>(handlers: { ok: (a: A) => T; err: (e: E) => T }): (result: Result<A, E>) => T;
} = dual(2, <A, E, T>(result: Result<A, E>, handlers: { ok: (a: A) => T; err: (e: E) => T }): T => {
  return result.match(handlers);
});

const tap: {
  <A, E>(result: Result<A, E>, fn: (a: A) => void): Result<A, E>;
  <A>(fn: (a: A) => void): <E>(result: Result<A, E>) => Result<A, E>;
} = dual(2, <A, E>(result: Result<A, E>, fn: (a: A) => void): Result<A, E> => {
  return result.tap(fn);
});

const tapAsync: {
  <A, E>(result: Result<A, E>, fn: (a: A) => Promise<void>): Promise<Result<A, E>>;
  <A>(fn: (a: A) => Promise<void>): <E>(result: Result<A, E>) => Promise<Result<A, E>>;
} = dual(2, <A, E>(result: Result<A, E>, fn: (a: A) => Promise<void>): Promise<Result<A, E>> => {
  return result.tapAsync(fn);
});

const unwrap = <A, E>(result: Result<A, E>, message?: string): A => {
  return result.unwrap(message);
};

/** Validates that a value is a Result instance. Throws with helpful message if not. */
function assertIsResult(value: unknown): asserts value is Result<unknown, unknown> {
  if (
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    (value.status === "ok" || value.status === "error")
  ) {
    return;
  }
  throw new Error(
    "Result.gen body must return Result.ok() or Result.err(), got: " +
      (value === null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value)),
  );
}

const unwrapOr: {
  <A, E, B>(result: Result<A, E>, fallback: B): A | B;
  <B>(fallback: B): <A, E>(result: Result<A, E>) => A | B;
} = dual(2, <A, E, B>(result: Result<A, E>, fallback: B): A | B => {
  return result.unwrapOr(fallback);
});

const gen: {
  <Yield extends Err<never, unknown>, R extends AnyResult>(
    body: () => Generator<Yield, R, unknown>,
  ): Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>;
  <Yield extends Err<never, unknown>, R extends AnyResult, This>(
    body: (this: This) => Generator<Yield, R, unknown>,
    thisArg: This,
  ): Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>;
  <Yield extends Err<never, unknown>, R extends AnyResult>(
    body: () => AsyncGenerator<Yield, R, unknown>,
  ): Promise<Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>>;
  <Yield extends Err<never, unknown>, R extends AnyResult, This>(
    body: (this: This) => AsyncGenerator<Yield, R, unknown>,
    thisArg: This,
  ): Promise<Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>>;
} = (<Yield extends Err<never, unknown>, R extends AnyResult, This>(
  body:
    | (() => Generator<Yield, R, unknown>)
    | (() => AsyncGenerator<Yield, R, unknown>)
    | ((this: This) => Generator<Yield, R, unknown>)
    | ((this: This) => AsyncGenerator<Yield, R, unknown>),
  thisArg?: This,
): Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>> | Promise<Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>> => {
  // SAFETY: body.call binds thisArg; cast needed due to union of function signatures
  const iterator = (body as (this: This) => Generator<Yield, R, unknown>).call(
    thisArg as This,
  );

  // Detect async generator via Symbol.asyncIterator
  if (Symbol.asyncIterator in iterator) {
    return (async () => {
      // SAFETY: Async check above guarantees this is an async generator
      const asyncIter = iterator as unknown as AsyncGenerator<Yield, R, unknown>;

      let state: IteratorResult<Yield, R>;
      try {
        state = await asyncIter.next();
      } catch (cause) {
        // Generator body threw before yielding (user code error or cleanup on success path)
        throw panic("generator body threw", cause);
      }

      assertIsResult(state.value);

      if (!state.done) {
        // Close generator to run finally blocks and Symbol.asyncDispose.
        // If cleanup throws, it's unrecoverable — Panic.
        try {
          await asyncIter.return?.(undefined as unknown as R);
        } catch (cause) {
          throw panic("generator cleanup threw", cause);
        }
      }

      return state.value as Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>;
    })();
  }

  // Sync generator
  // SAFETY: If not async, must be sync generator
  const syncIter = iterator as Generator<Yield, R, unknown>;

  let state: IteratorResult<Yield, R>;
  try {
    state = syncIter.next();
  } catch (cause) {
    // Generator body threw before yielding (user code error or cleanup on success path)
    throw panic("generator body threw", cause);
  }

  assertIsResult(state.value);

  if (!state.done) {
    // Close generator to run finally blocks and Symbol.dispose.
    // If cleanup throws, it's unrecoverable — Panic.
    try {
      syncIter.return?.(undefined as unknown as R);
    } catch (cause) {
      throw panic("generator cleanup threw", cause);
    }
  }

  return state.value as Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>;
}) as {
  <Yield extends Err<never, unknown>, R extends AnyResult>(
    body: () => Generator<Yield, R, unknown>,
  ): Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>;
  <Yield extends Err<never, unknown>, R extends AnyResult, This>(
    body: (this: This) => Generator<Yield, R, unknown>,
    thisArg: This,
  ): Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>;
  <Yield extends Err<never, unknown>, R extends AnyResult>(
    body: () => AsyncGenerator<Yield, R, unknown>,
  ): Promise<Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>>;
  <Yield extends Err<never, unknown>, R extends AnyResult, This>(
    body: (this: This) => AsyncGenerator<Yield, R, unknown>,
    thisArg: This,
  ): Promise<Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>>;
};

async function* resultAwait<T, E>(
  promise: Promise<Result<T, E>>,
): AsyncGenerator<Err<never, E>, T, unknown> {
  const result = await promise;
  return yield* result;
}

/** Shape of a serialized Result over RPC. */
interface SerializedOk<T> {
  status: "ok";
  value: T;
}

interface SerializedErr<E> {
  status: "error";
  error: E;
}

type SerializedResult<T, E> = SerializedOk<T> | SerializedErr<E>;

function isSerializedResult(obj: unknown): obj is SerializedResult<unknown, unknown> {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "status" in obj &&
    ((obj.status === "ok" && "value" in obj) || (obj.status === "error" && "error" in obj))
  );
}

const hydrate = <T, E>(value: unknown): Result<T, E> | null => {
  if (isSerializedResult(value)) {
    return value.status === "ok"
      ? (new Ok(value.value) as Result<T, E>)
      : (new Err(value.error) as Result<T, E>);
  }
  return null;
};

/**
 * Utilities for creating and handling Result types.
 *
 * @example
 * const result = Result.try(() => JSON.parse(str));
 * const value = result.map(x => x.id).unwrapOr("default");
 */
export const Result = {
  /**
   * Creates successful result.
   *
   * @example
   * Result.ok(42) // Ok(42)
   */
  ok,
  /**
   * Type guard for Ok.
   *
   * @example
   * if (Result.isOk(result)) { result.value }
   */
  isOk,
  /**
   * Creates error result.
   *
   * @example
   * Result.err("failed") // Err("failed")
   */
  err,
  /**
   * Type guard for Err.
   *
   * @example
   * if (Result.isError(result)) { result.error }
   */
  isError,
  /**
   * Executes sync function, wraps result/error in Result.
   *
   * @example
   * Result.try(() => JSON.parse(str))
   * Result.try({ try: () => parse(x), catch: e => new ParseError(e) })
   */
  try: tryFn,
  /**
   * Executes async function, wraps result/error in Result with retry support.
   *
   * @example
   * await Result.tryPromise(() => fetch(url))
   * await Result.tryPromise({
   *   try: () => fetch(url),
   *   catch: e => new NetworkError(e)
   * }, { retry: { times: 3, delayMs: 100, backoff: "exponential" } })
   */
  tryPromise,
  /**
   * Transforms success value, passes error through.
   *
   * @example
   * Result.map(ok(2), x => x * 2) // Ok(4)
   * Result.map(x => x * 2)(ok(2)) // Ok(4)
   */
  map,
  /**
   * Transforms error value, passes success through.
   *
   * @example
   * Result.mapError(err("fail"), e => new Error(e)) // Err(Error("fail"))
   */
  mapError,
  /**
   * Chains Result-returning function on success.
   *
   * @example
   * Result.andThen(ok(2), x => x > 0 ? ok(x) : err("neg")) // Ok(2)
   */
  andThen,
  /**
   * Chains async Result-returning function on success.
   *
   * @example
   * await Result.andThenAsync(ok(1), async x => ok(await fetch(x)))
   */
  andThenAsync,
  /**
   * Pattern matches on Result.
   *
   * @example
   * Result.match(ok(2), { ok: x => x * 2, err: () => 0 }) // 4
   */
  match,
  /**
   * Runs side effect on success value, returns original result.
   *
   * @example
   * Result.tap(ok(2), console.log) // logs 2, returns Ok(2)
   */
  tap,
  /**
   * Runs async side effect on success value, returns original result.
   *
   * @example
   * await Result.tapAsync(ok(2), async x => await log(x))
   */
  tapAsync,
  /**
   * Extracts value or throws.
   *
   * @example
   * Result.unwrap(ok(42)) // 42
   * Result.unwrap(err("fail")) // throws Error
   */
  unwrap,
  /**
   * Extracts value or returns fallback.
   *
   * @example
   * Result.unwrapOr(ok(42), 0) // 42
   * Result.unwrapOr(err("fail"), 0) // 0
   */
  unwrapOr,
  /**
   * Generator-based composition for Result types.
   *
   * @example
   * const result = Result.gen(function* () {
   *   const a = yield* getA();
   *   const b = yield* getB(a);
   *   return Result.ok({ a, b });
   * });
   *
   * // Async with Result.await
   * const result = await Result.gen(async function* () {
   *   const a = yield* Result.await(fetchA());
   *   const b = yield* Result.await(fetchB(a));
   *   return Result.ok({ a, b });
   * });
   */
  gen,
  /**
   * Wraps Promise<Result> to be yieldable in async Result.gen blocks.
   *
   * @example
   * yield* Result.await(fetchUser(id))
   */
  await: resultAwait,
  /**
   * Rehydrates serialized Result from RPC back into Ok/Err instances.
   * Returns null if not a serialized Result.
   *
   * @example
   * const hydrated = Result.hydrate(rpcResponse);
   */
  hydrate,
} as const;
