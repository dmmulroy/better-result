import { dual } from "./dual";
import { ResultDeserializationError, UnhandledException } from "./error";
import {
  Err,
  Ok,
  err,
  isError,
  isOk,
  ok,
  panic,
  type AnyResult,
  type InferErr,
  type InferOk,
  type TapBothAsyncHandlers,
  type TapBothHandlers,
} from "./core";

export { Err, Ok } from "./core";
export type { InferErr, InferOk } from "./core";
export type Result<T, E> = import("./core").Result<T, E>;

/** Executes fn, panics if it throws. */
const tryOrPanic = <T>(fn: () => T, message: string): T => {
  try {
    return fn();
  } catch (cause) {
    throw panic(message, cause);
  }
};

/**
 * Extracts error type E from yield union in Result.gen.
 * Yields are always Err<never, E>, so we match on that pattern.
 * Distributive conditional: InferYieldErr<Err<never, A> | Err<never, B>> = A | B
 */
type InferYieldErr<Y> = Y extends Err<never, infer E> ? E : never;

type NoInfer<T> = [T][T extends unknown ? 0 : never];

const tryFn: {
  <A, E>(
    options: { try: () => Awaited<A>; catch: (cause: unknown) => Awaited<E>; },
    config?: { retry?: { times: number; }; },
  ): Result<A, E>;
  <A>(
    thunk: () => Awaited<A>,
    config?: { retry?: { times: number; }; },
  ): Result<A, UnhandledException>;
} = <A, E>(
  options: (() => Awaited<A>) | { try: () => Awaited<A>; catch: (cause: unknown) => Awaited<E>; },
  config?: { retry?: { times: number; }; },
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

type RetryConfig<E = unknown> = {
  retry?: {
    times: number;
    delayMs: number;
    backoff: "linear" | "constant" | "exponential";
    /** Predicate to determine if an error should trigger a retry. Defaults to always retry. */
    shouldRetry?: (error: E) => boolean;
  };
};

const tryPromise: {
  <A, E>(
    options: { try: () => Promise<A>; catch: (cause: unknown) => E | Promise<E>; },
    config?: RetryConfig<E>,
  ): Promise<Result<A, E>>;
  <A>(
    thunk: () => Promise<A>,
    config?: RetryConfig<UnhandledException>,
  ): Promise<Result<A, UnhandledException>>;
} = async <A, E>(
  options:
    | (() => Promise<A>)
    | { try: () => Promise<A>; catch: (cause: unknown) => E | Promise<E>; },
  config?: RetryConfig<E | UnhandledException>,
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
          return err(await options.catch(originalCause));
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

    const shouldRetryFn = retry.shouldRetry ?? (() => true);

    for (let attempt = 0; attempt < retry.times; attempt++) {
      if (result.status !== "error") break;
      const error = result.error;
      const shouldContinue = tryOrPanic(() => shouldRetryFn(error), "shouldRetry predicate threw");
      if (!shouldContinue) break;
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

const tryRecover: {
  <A, E, E2>(result: Result<A, E>, fn: (e: E) => Result<NoInfer<A>, E2>): Result<A, E2>;
  <E, E2>(fn: (e: E) => Result<never, E2>): <A>(result: Result<A, E>) => Result<A, E2>;
  <E, A, E2>(fn: (e: E) => Result<A, E2>): (result: Result<A, E>) => Result<A, E2>;
} = dual(
  2,
  <A, E, E2>(
    result: Result<A, E>,
    fn: (e: E) => Result<NoInfer<A>, E2>,
  ): Result<A, E2> => {
    return result.tryRecover(fn);
  },
);

const andThen: {
  <A, B, E, E2>(result: Result<A, E>, fn: (a: A) => Result<B, E2>): Result<B, E | E2>;
  <A, B, E2>(
    fn: (a: A) => Result<B, E2>,
  ): <E>(result: Result<A, E>) => Result<B, E | E2>;
} = dual(
  2,
  <A, B, E, E2>(
    result: Result<A, E>,
    fn: (a: A) => Result<B, E2>,
  ): Result<B, E | E2> => {
    return result.andThen(fn);
  },
);

const tryRecoverAsync: {
  <A, E, E2>(
    result: Result<A, E>,
    fn: (e: E) => Promise<Result<NoInfer<A>, E2>>,
  ): Promise<Result<A, E2>>;
  <E, E2>(
    fn: (e: E) => Promise<Result<never, E2>>,
  ): <A>(result: Result<A, E>) => Promise<Result<A, E2>>;
  <E, A, E2>(
    fn: (e: E) => Promise<Result<A, E2>>,
  ): (result: Result<A, E>) => Promise<Result<A, E2>>;
} = dual(
  2,
  <A, E, E2>(
    result: Result<A, E>,
    fn: (e: E) => Promise<Result<NoInfer<A>, E2>>,
  ): Promise<Result<A, E2>> => {
    return result.tryRecoverAsync(fn);
  },
);

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
  <A, E, T>(handlers: { ok: (a: A) => T; err: (e: E) => T; }): (result: Result<A, E>) => T;
  <A, E, T>(result: Result<A, E>, handlers: { ok: (a: A) => T; err: (e: E) => T; }): T;
} = dual(
  2,
  <A, E, T>(result: Result<A, E>, handlers: { ok: (a: A) => T; err: (e: E) => T; }): T => {
    return result.match(handlers);
  },
);

const tap: {
  <A, E>(result: Result<A, E>, fn: (a: A) => void): Result<A, E>;
  <A>(fn: (a: A) => void): <E>(result: Result<A, E>) => Result<A, E>;
} = dual(2, <A, E>(result: Result<A, E>, fn: (a: A) => void): Result<A, E> => {
  return result.tap(fn);
});

const tapAsync: {
  <A, E>(result: Result<A, E>, fn: (a: A) => Promise<void>): Promise<Result<A, E>>;
  <A>(fn: (a: A) => Promise<void>): <E>(result: Result<A, E>) => Promise<Result<A, E>>;
} = dual(
  2,
  <A, E>(result: Result<A, E>, fn: (a: A) => Promise<void>): Promise<Result<A, E>> => {
    return result.tapAsync(fn);
  },
);

const tapError: {
  <A, E>(result: Result<A, E>, fn: (e: E) => void): Result<A, E>;
  <E>(fn: (e: E) => void): <A>(result: Result<A, E>) => Result<A, E>;
} = dual(2, <A, E>(result: Result<A, E>, fn: (e: E) => void): Result<A, E> => {
  return result.tapError(fn);
});

const tapErrorAsync: {
  <A, E>(result: Result<A, E>, fn: (e: E) => Promise<void>): Promise<Result<A, E>>;
  <E>(fn: (e: E) => Promise<void>): <A>(result: Result<A, E>) => Promise<Result<A, E>>;
} = dual(
  2,
  <A, E>(result: Result<A, E>, fn: (e: E) => Promise<void>): Promise<Result<A, E>> => {
    return result.tapErrorAsync(fn);
  },
);

const tapBoth: {
  <A, E>(handlers: TapBothHandlers<A, E>): (result: Result<A, E>) => Result<A, E>;
  <A, E>(result: Result<A, E>, handlers: TapBothHandlers<A, E>): Result<A, E>;
} = dual(2, <A, E>(result: Result<A, E>, handlers: TapBothHandlers<A, E>): Result<A, E> => {
  return result.tapBoth(handlers);
});

const tapBothAsync: {
  <A, E>(
    handlers: TapBothAsyncHandlers<A, E>,
  ): (result: Result<A, E>) => Promise<Result<A, E>>;
  <A, E>(result: Result<A, E>, handlers: TapBothAsyncHandlers<A, E>): Promise<Result<A, E>>;
} = dual(
  2,
  <A, E>(
    result: Result<A, E>,
    handlers: TapBothAsyncHandlers<A, E>,
  ): Promise<Result<A, E>> => {
    return result.tapBothAsync(handlers);
  },
);

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
  return panic(
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
):
  | Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>
  | Promise<Result<InferOk<R>, InferYieldErr<Yield> | InferErr<R>>> => {
  // SAFETY: body.call binds thisArg; cast needed due to union of function signatures
  const iterator = (body as (this: This) => Generator<Yield, R, unknown>).call(thisArg as This);

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

/** Shape of a serialized Ok over RPC. */
export interface SerializedOk<T> {
  status: "ok";
  value: T;
}

/** Shape of a serialized Err over RPC. */
export interface SerializedErr<E> {
  status: "error";
  error: E;
}

/** Shape of a serialized Result over RPC. */
export type SerializedResult<T, E> = SerializedOk<T> | SerializedErr<E>;

function isSerializedResult(obj: unknown): obj is SerializedResult<unknown, unknown> {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "status" in obj &&
    ((obj.status === "ok" && "value" in obj) || (obj.status === "error" && "error" in obj))
  );
}

const serialize = <T, E>(result: Result<T, E>): SerializedResult<T, E> => {
  return result.status === "ok"
    ? { status: "ok", value: result.value }
    : { status: "error", error: result.error };
};

const deserialize = <T, E>(value: unknown): Result<T, E | ResultDeserializationError> => {
  if (isSerializedResult(value)) {
    return value.status === "ok"
      ? (new Ok(value.value) as Result<T, E>)
      : (new Err(value.error) as Result<T, E>);
  }
  return err(new ResultDeserializationError({ value }));
};

/**
 * @deprecated Use `Result.deserialize` instead. Will be removed in 3.0.
 */
const hydrate = <T, E>(value: unknown): Result<T, E | ResultDeserializationError> => {
  return deserialize(value);
};

const partition = <T, E>(results: readonly Result<T, E>[]): [T[], E[]] => {
  const oks: T[] = [];
  const errs: E[] = [];
  for (const r of results) {
    if (r.status === "ok") {
      oks.push(r.value);
    } else {
      errs.push(r.error);
    }
  }
  return [oks, errs];
};

/**
 * Flattens nested Result into single Result.
 *
 * @example
 * const nested: Result<Result<number, E1>, E2> = Result.ok(Result.ok(42));
 * const flat: Result<number, E1 | E2> = Result.flatten(nested); // Ok(42)
 */
const flatten = <T, E, E2>(result: Result<Result<T, E>, E2>): Result<T, E | E2> => {
  if (result.status === "ok") {
    return result.value;
  }
  // SAFETY: T is phantom on Err (not used at runtime), widening E2 to E|E2 is safe
  return result as unknown as Err<T, E | E2>;
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
   * Result.ok(42)  // Ok<number, never>
   * Result.ok()    // Ok<void, never> - for side-effectful operations
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
   * // Basic retry
   * await Result.tryPromise(() => fetch(url), {
   *   retry: { times: 3, delayMs: 100, backoff: "exponential" }
   * })
   *
   * @example
   * // Retry only for specific error types (user-defined TaggedError classes)
   * await Result.tryPromise({
   *   try: () => fetch(url),
   *   catch: e => e instanceof TypeError ? new RetryableError(e) : new FatalError(e)
   * }, {
   *   retry: {
   *     times: 3,
   *     delayMs: 100,
   *     backoff: "exponential",
   *     shouldRetry: e => e._tag === "RetryableError"
   *   }
   * })
   *
   * @example
   * // Async retry decisions: enrich error in catch handler
   * await Result.tryPromise({
   *   try: () => callApi(url),
   *   catch: async (e) => {
   *     const limited = await redis.get(`ratelimit:${userId}`);
   *     return new ApiError({ cause: e, rateLimited: !!limited });
   *   }
   * }, {
   *   retry: { times: 3, delayMs: 100, backoff: "exponential", shouldRetry: e => !e.rateLimited }
   * })
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
   * Attempts to recover from an error into the same success type.
   *
   * @example
   * Result.tryRecover(err("fail"), e => ok(e.length)) // Ok(4)
   * Result.tryRecover(e => ok(e.length))(err("fail")) // Ok(4)
   */
  tryRecover,
  /**
   * Chains Result-returning function on success.
   *
   * @example
   * Result.andThen(ok(2), x => x > 0 ? ok(x) : err("neg")) // Ok(2)
   */
  andThen,
  /**
   * Attempts to recover from an error into the same success type asynchronously.
   *
   * @example
   * await Result.tryRecoverAsync(err("fail"), async e => ok(e.length)) // Ok(4)
   * await Result.tryRecoverAsync(async e => ok(e.length))(err("fail")) // Ok(4)
   */
  tryRecoverAsync,
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
   * Runs side effect on error value, returns original result.
   *
   * @example
   * Result.tapError(err("fail"), console.error) // logs "fail", returns Err("fail")
   * Result.tapError(console.error)(err("fail")) // logs "fail", returns Err("fail")
   */
  tapError,
  /**
   * Runs async side effect on error value, returns original result.
   *
   * @example
   * await Result.tapErrorAsync(err("fail"), async e => await reportError(e))
   * await Result.tapErrorAsync(async e => await reportError(e))(err("fail"))
   */
  tapErrorAsync,
  /**
   * Runs side effect on either branch, returns original result.
   *
   * @example
   * Result.tapBoth(ok(2), { ok: console.log, err: console.error })
   * Result.tapBoth({ ok: console.log, err: console.error })(err("fail"))
   */
  tapBoth,
  /**
   * Runs async side effect on either branch, returns original result.
   *
   * @example
   * await Result.tapBothAsync(ok(2), { ok: async x => await log(x), err: async e => await reportError(e) })
   * await Result.tapBothAsync({ ok: async x => await log(x), err: async e => await reportError(e) })(err("fail"))
   */
  tapBothAsync,
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
   * Errors from yielded Results form a union; use mapError to normalize.
   *
   * @example
   * const result = Result.gen(function* () {
   *   const a = yield* getA(); // Err: ErrorA
   *   const b = yield* getB(a); // Err: ErrorB
   *   return Result.ok({ a, b });
   * });
   * // Result<{a, b}, ErrorA | ErrorB>
   *
   * @example
   * // Normalize error types with mapError
   * const result = Result.gen(function* () {
   *   const a = yield* getA();
   *   const b = yield* getB(a);
   *   return Result.ok({ a, b });
   * }).mapError(e => new UnifiedError(e._tag, e.message));
   * // Result<{a, b}, UnifiedError>
   *
   * @example
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
   * Converts a Result to a plain object for serialization (e.g., RPC, server actions).
   *
   * @example
   * const serialized = Result.serialize(ok(42)); // { status: "ok", value: 42 }
   */
  serialize,
  /**
   * Rehydrates serialized Result from RPC back into Ok/Err instances.
   * Returns `Err<ResultDeserializationError>` if the input is not a valid serialized Result.
   *
   * @example
   * // Valid serialized Result
   * const result = Result.deserialize<User, AppError>(rpcResponse);
   * if (Result.isOk(result)) {
   *   console.log(result.value); // User
   * }
   *
   * // Invalid input returns ResultDeserializationError
   * const invalid = Result.deserialize({ foo: "bar" });
   * if (Result.isError(invalid) && ResultDeserializationError.is(invalid.error)) {
   *   console.log("Bad input:", invalid.error.value);
   * }
   */
  deserialize,
  /**
   * @deprecated Use `Result.deserialize` instead. Will be removed in 3.0.
   */
  hydrate,
  /**
   * Splits array of Results into tuple of [okValues, errorValues].
   *
   * @example
   * partition([ok(1), err("a"), ok(2)]) // [[1, 2], ["a"]]
   */
  partition,
  /**
   * Flattens nested Result into single Result.
   *
   * @example
   * const nested = Result.ok(Result.ok(42));
   * Result.flatten(nested) // Ok(42)
   */
  flatten,
} as const;
