import { dual } from "./dual";
import { ResultDeserializationError, ResultSerializationError, UnhandledException } from "./error";
import { type StandardSchemaV1 } from "./standard-schema";
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
export type { StandardSchemaV1 } from "./standard-schema";
export type Result<T, E> = import("./core").Result<T, E>;
/** A validation issue reported by a Standard Schema-compatible schema. */
export type StandardSchemaIssue = StandardSchemaV1.Issue;
/** A property key wrapper used in Standard Schema validation paths. */
export type StandardSchemaPathSegment = StandardSchemaV1.PathSegment;
/** The success or issue result returned by a Standard Schema-compatible validator. */
export type StandardSchemaResult<Output> = StandardSchemaV1.Result<Output>;

/** Context passed to each `Result.try` attempt. */
export type TryContext = {
  /** One-based execution count, including the initial attempt. */
  readonly attempt: number;
};

/** Context passed to each `Result.tryPromise` attempt and retry decision. */
export type TryPromiseContext = TryContext & {
  /** Abort signal supplied through the top-level `Result.tryPromise` config. */
  readonly signal?: AbortSignal;
};

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
    options: { try: (context: TryContext) => Awaited<A>; catch: (cause: unknown) => Awaited<E> },
    config?: { retry?: { times: number } },
  ): Result<A, E>;
  <A>(
    thunk: (context: TryContext) => Awaited<A>,
    config?: { retry?: { times: number } },
  ): Result<A, UnhandledException>;
} = <A, E>(
  options:
    | ((context: TryContext) => Awaited<A>)
    | { try: (context: TryContext) => Awaited<A>; catch: (cause: unknown) => Awaited<E> },
  config?: { retry?: { times: number } },
): Result<A, E | UnhandledException> => {
  const execute = (context: TryContext): Result<A, E | UnhandledException> => {
    if (typeof options === "function") {
      try {
        return ok(options(context));
      } catch (cause) {
        return err(new UnhandledException({ cause }));
      }
    }
    try {
      return ok(options.try(context));
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
  let attempt = 1;
  let result = execute({ attempt });

  for (let retry = 0; retry < times && result.status === "error"; retry++) {
    attempt++;
    result = execute({ attempt });
  }

  return result;
};

type RetryConfig<E = unknown> = {
  /** Abort signal forwarded unchanged to every try and retry-decision context. */
  signal?: AbortSignal;
  retry?: {
    times: number;
    delayMs: number;
    backoff: "linear" | "constant" | "exponential";
    /** Predicate to determine if an error should trigger a retry. Defaults to always retry. */
    shouldRetry?: (error: E, context: TryPromiseContext) => boolean;
  };
};

const tryPromise: {
  <A, E>(
    options: {
      try: (context: TryPromiseContext) => Promise<A>;
      catch: (cause: unknown) => E | Promise<E>;
    },
    config?: RetryConfig<E>,
  ): Promise<Result<A, E>>;
  <A>(
    thunk: (context: TryPromiseContext) => Promise<A>,
    config?: RetryConfig<UnhandledException>,
  ): Promise<Result<A, UnhandledException>>;
} = async <A, E>(
  options:
    | ((context: TryPromiseContext) => Promise<A>)
    | {
        try: (context: TryPromiseContext) => Promise<A>;
        catch: (cause: unknown) => E | Promise<E>;
      },
  config?: RetryConfig<E | UnhandledException>,
): Promise<Result<A, E | UnhandledException>> => {
  const execute = async (
    context: TryPromiseContext,
  ): Promise<Result<A, E | UnhandledException>> => {
    if (typeof options === "function") {
      try {
        return ok(await options(context));
      } catch (cause) {
        return err(new UnhandledException({ cause }));
      }
    }
    try {
      return ok(await options.try(context));
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
    return execute({ attempt: 1, signal: config?.signal });
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

  const sleepForRetryDelay = (ms: number, signal?: AbortSignal): Promise<boolean> =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve(false);
        return;
      }

      const onAbort = () => {
        clearTimeout(timeout);
        resolve(false);
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve(true);
      }, ms);

      signal?.addEventListener("abort", onAbort, { once: true });
    });

  let context: TryPromiseContext = { attempt: 1, signal: config.signal };
  let result = await execute(context);

  const shouldRetryFn = retry.shouldRetry ?? (() => true);

  for (let retryAttempt = 0; retryAttempt < retry.times; retryAttempt++) {
    if (result.status !== "error" || context.signal?.aborted) break;
    const error = result.error;
    const shouldContinue = tryOrPanic(
      () => shouldRetryFn(error, context),
      "shouldRetry predicate threw",
    );
    if (!shouldContinue) break;
    const delayCompleted = await sleepForRetryDelay(getDelay(retryAttempt), context.signal);
    if (!delayCompleted || context.signal?.aborted) break;
    context = { attempt: context.attempt + 1, signal: config.signal };
    result = await execute(context);
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
  <A, E, E2>(result: Result<A, E>, fn: (e: E) => Result<NoInfer<A>, E2>): Result<A, E2> => {
    return result.tryRecover(fn);
  },
);

const andThen: {
  <A, B, E, E2>(result: Result<A, E>, fn: (a: A) => Result<B, E2>): Result<B, E | E2>;
  <A, B, E2>(fn: (a: A) => Result<B, E2>): <E>(result: Result<A, E>) => Result<B, E | E2>;
} = dual(2, <A, B, E, E2>(result: Result<A, E>, fn: (a: A) => Result<B, E2>): Result<B, E | E2> => {
  return result.andThen(fn);
});

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
  <A, E, T>(handlers: { ok: (a: A) => T; err: (e: E) => T }): (result: Result<A, E>) => T;
  <A, E, T>(result: Result<A, E>, handlers: { ok: (a: A) => T; err: (e: E) => T }): T;
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

const tapError: {
  <A, E>(result: Result<A, E>, fn: (e: E) => void): Result<A, E>;
  <E>(fn: (e: E) => void): <A>(result: Result<A, E>) => Result<A, E>;
} = dual(2, <A, E>(result: Result<A, E>, fn: (e: E) => void): Result<A, E> => {
  return result.tapError(fn);
});

const tapErrorAsync: {
  <A, E>(result: Result<A, E>, fn: (e: E) => Promise<void>): Promise<Result<A, E>>;
  <E>(fn: (e: E) => Promise<void>): <A>(result: Result<A, E>) => Promise<Result<A, E>>;
} = dual(2, <A, E>(result: Result<A, E>, fn: (e: E) => Promise<void>): Promise<Result<A, E>> => {
  return result.tapErrorAsync(fn);
});

const tapBoth: {
  <A, E>(handlers: TapBothHandlers<A, E>): (result: Result<A, E>) => Result<A, E>;
  <A, E>(result: Result<A, E>, handlers: TapBothHandlers<A, E>): Result<A, E>;
} = dual(2, <A, E>(result: Result<A, E>, handlers: TapBothHandlers<A, E>): Result<A, E> => {
  return result.tapBoth(handlers);
});

const tapBothAsync: {
  <A, E>(handlers: TapBothAsyncHandlers<A, E>): (result: Result<A, E>) => Promise<Result<A, E>>;
  <A, E>(result: Result<A, E>, handlers: TapBothAsyncHandlers<A, E>): Promise<Result<A, E>>;
} = dual(
  2,
  <A, E>(result: Result<A, E>, handlers: TapBothAsyncHandlers<A, E>): Promise<Result<A, E>> => {
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

type SerializedOkEnvelope = {
  readonly status: "ok";
  readonly value?: unknown;
};

type SerializedErrEnvelope = {
  readonly status: "error";
  readonly error?: unknown;
};

type SerializedResultEnvelope = SerializedOkEnvelope | SerializedErrEnvelope;

/** Infers the input accepted by a Standard Schema-compatible schema. */
export type StandardSchemaInput<TSchema extends StandardSchemaV1> =
  StandardSchemaV1.InferInput<TSchema>;

/** Infers the output produced by a Standard Schema-compatible schema. */
export type StandardSchemaOutput<TSchema extends StandardSchemaV1> =
  StandardSchemaV1.InferOutput<TSchema>;

type StandardSchemaValidationResult<TSchema extends StandardSchemaV1> = ReturnType<
  TSchema["~standard"]["validate"]
>;

type StandardSchemaAsyncValidation<TSchema extends StandardSchemaV1> = Extract<
  StandardSchemaValidationResult<TSchema>,
  PromiseLike<unknown>
>;

type StandardSchemaSyncValidation<TSchema extends StandardSchemaV1> = Exclude<
  StandardSchemaValidationResult<TSchema>,
  PromiseLike<unknown>
>;

type StandardSchemaOperationResult<T, TSchema extends StandardSchemaV1> = [
  StandardSchemaAsyncValidation<TSchema>,
] extends [never]
  ? T
  : [StandardSchemaSyncValidation<TSchema>] extends [never]
    ? Promise<T>
    : T | Promise<T>;

type SerializedCodecResult<
  TOkSerialize extends StandardSchemaV1,
  TErrSerialize extends StandardSchemaV1,
> = Result<
  SerializedResult<StandardSchemaOutput<TOkSerialize>, StandardSchemaOutput<TErrSerialize>>,
  ResultSerializationError
>;

type SerializedCodecOperationResult<
  TResult extends Result<StandardSchemaInput<TOkSerialize>, StandardSchemaInput<TErrSerialize>>,
  TOkSerialize extends StandardSchemaV1,
  TErrSerialize extends StandardSchemaV1,
> =
  TResult extends Ok<StandardSchemaInput<TOkSerialize>, StandardSchemaInput<TErrSerialize>>
    ? StandardSchemaOperationResult<
        SerializedCodecResult<TOkSerialize, TErrSerialize>,
        TOkSerialize
      >
    : TResult extends Err<StandardSchemaInput<TOkSerialize>, StandardSchemaInput<TErrSerialize>>
      ? StandardSchemaOperationResult<
          SerializedCodecResult<TOkSerialize, TErrSerialize>,
          TErrSerialize
        >
      : never;

type DeserializedCodecResult<
  TOkDeserialize extends StandardSchemaV1,
  TErrDeserialize extends StandardSchemaV1,
> = Result<
  StandardSchemaOutput<TOkDeserialize>,
  StandardSchemaOutput<TErrDeserialize> | ResultDeserializationError
>;

type UnknownDeserializationResult<
  TOkDeserialize extends StandardSchemaV1,
  TErrDeserialize extends StandardSchemaV1,
> =
  | DeserializedCodecResult<TOkDeserialize, TErrDeserialize>
  | StandardSchemaOperationResult<
      DeserializedCodecResult<TOkDeserialize, TErrDeserialize>,
      TOkDeserialize
    >
  | StandardSchemaOperationResult<
      DeserializedCodecResult<TOkDeserialize, TErrDeserialize>,
      TErrDeserialize
    >;

/** Standard Schema serializers and deserializers for both Result branches. */
export interface ResultCodecConfig<
  TOkSerialize extends StandardSchemaV1,
  TErrSerialize extends StandardSchemaV1,
  TOkDeserialize extends StandardSchemaV1,
  TErrDeserialize extends StandardSchemaV1,
> {
  /** Schemas that convert in-memory Result payloads into wire payloads. */
  readonly serialize: {
    /** Serializes an Ok value. */
    readonly ok: TOkSerialize;
    /** Serializes an Err value. */
    readonly err: TErrSerialize;
  };
  /** Schemas that parse wire payloads back into in-memory Result payloads. */
  readonly deserialize: {
    /** Deserializes a serialized Ok value. */
    readonly ok: TOkDeserialize;
    /** Deserializes a serialized Err value. */
    readonly err: TErrDeserialize;
  };
}

/** Converts Result values to and from a validated serialized representation. */
export interface ResultCodec<
  TOkSerialize extends StandardSchemaV1,
  TErrSerialize extends StandardSchemaV1,
  TOkDeserialize extends StandardSchemaV1,
  TErrDeserialize extends StandardSchemaV1,
> {
  /** Serializes the selected Result branch, preserving that branch schema's sync or async return. */
  readonly serialize: <
    TResult extends Result<StandardSchemaInput<TOkSerialize>, StandardSchemaInput<TErrSerialize>>,
  >(
    result: TResult,
  ) => SerializedCodecOperationResult<TResult, TOkSerialize, TErrSerialize>;
  /** Deserializes a known branch precisely, including status-only envelopes produced when JSON omits undefined payloads. */
  readonly deserialize: {
    (
      value: SerializedOkEnvelope,
    ): StandardSchemaOperationResult<
      DeserializedCodecResult<TOkDeserialize, TErrDeserialize>,
      TOkDeserialize
    >;
    (
      value: SerializedErrEnvelope,
    ): StandardSchemaOperationResult<
      DeserializedCodecResult<TOkDeserialize, TErrDeserialize>,
      TErrDeserialize
    >;
    (value: unknown): UnknownDeserializationResult<TOkDeserialize, TErrDeserialize>;
  };
}

/** Checks only the Result envelope; the selected codec schema validates its optional payload. */
function isSerializedResultEnvelope(value: unknown): value is SerializedResultEnvelope {
  return (
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    (value.status === "ok" || value.status === "error")
  );
}

const isPromiseLike = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
};

const runStandardSchemaValidation = <TResult>(
  validate: () => TResult,
  panicMessage: string,
): TResult => {
  return tryOrPanic(validate, panicMessage);
};

const mapStandardSchemaValidation = <T, U>(
  validation: StandardSchemaV1.Result<T> | PromiseLike<StandardSchemaV1.Result<T>>,
  panicMessage: string,
  mapValidation: (validation: StandardSchemaV1.Result<T>) => U,
): U | Promise<U> => {
  if (isPromiseLike(validation)) {
    return Promise.resolve(validation)
      .catch((cause: unknown) => {
        throw panic(panicMessage, cause);
      })
      .then(mapValidation);
  }
  return mapValidation(validation);
};

const unwrapCodecValidation = <T, E>(
  validation: StandardSchemaV1.Result<T>,
  makeError: (issues: ReadonlyArray<StandardSchemaV1.Issue>) => E,
): Result<T, E> => {
  if ("issues" in validation && validation.issues) {
    return err(makeError(validation.issues));
  }
  return ok(validation.value);
};

const serializeWithSchema = <TSchema extends StandardSchemaV1>(
  schema: TSchema,
  value: StandardSchemaInput<TSchema>,
):
  | Result<StandardSchemaOutput<TSchema>, ResultSerializationError>
  | Promise<Result<StandardSchemaOutput<TSchema>, ResultSerializationError>> => {
  const validation = runStandardSchemaValidation(
    () => schema["~standard"].validate(value),
    "Result.codec serialize schema threw",
  );
  return mapStandardSchemaValidation(
    validation,
    "Result.codec serialize schema threw",
    (resolved) =>
      unwrapCodecValidation(resolved, (issues) => new ResultSerializationError({ value, issues })),
  );
};

const deserializeWithSchema = <TSchema extends StandardSchemaV1>(
  schema: TSchema,
  value: unknown,
):
  | Result<StandardSchemaOutput<TSchema>, ResultDeserializationError>
  | Promise<Result<StandardSchemaOutput<TSchema>, ResultDeserializationError>> => {
  const validation = runStandardSchemaValidation(
    () => schema["~standard"].validate(value),
    "Result.codec deserialize schema threw",
  );
  return mapStandardSchemaValidation(
    validation,
    "Result.codec deserialize schema threw",
    (resolved) =>
      unwrapCodecValidation(
        resolved,
        (issues) => new ResultDeserializationError({ value, issues }),
      ),
  );
};

const codec = <
  TOkSerialize extends StandardSchemaV1,
  TErrSerialize extends StandardSchemaV1,
  TOkDeserialize extends StandardSchemaV1,
  TErrDeserialize extends StandardSchemaV1,
>(
  config: ResultCodecConfig<TOkSerialize, TErrSerialize, TOkDeserialize, TErrDeserialize>,
): ResultCodec<TOkSerialize, TErrSerialize, TOkDeserialize, TErrDeserialize> => {
  type SerializeResult = SerializedCodecResult<TOkSerialize, TErrSerialize>;
  type DeserializeResult = DeserializedCodecResult<TOkDeserialize, TErrDeserialize>;
  type InputResult = Result<StandardSchemaInput<TOkSerialize>, StandardSchemaInput<TErrSerialize>>;

  const finishOkSerialization = (
    resolved: Result<StandardSchemaOutput<TOkSerialize>, ResultSerializationError>,
  ): SerializeResult => {
    if (resolved.status === "error") {
      return err(resolved.error);
    }
    return ok({ status: "ok", value: resolved.value });
  };

  const finishErrSerialization = (
    resolved: Result<StandardSchemaOutput<TErrSerialize>, ResultSerializationError>,
  ): SerializeResult => {
    if (resolved.status === "error") {
      return err(resolved.error);
    }
    return ok({ status: "error", error: resolved.value });
  };

  function serializeResult<TResult extends InputResult>(
    result: TResult,
  ): SerializedCodecOperationResult<TResult, TOkSerialize, TErrSerialize>;
  function serializeResult(result: InputResult): SerializeResult | Promise<SerializeResult> {
    if (result.status === "ok") {
      const serialized = serializeWithSchema(config.serialize.ok, result.value);
      return isPromiseLike(serialized)
        ? Promise.resolve(serialized).then(finishOkSerialization)
        : finishOkSerialization(serialized);
    }
    const serialized = serializeWithSchema(config.serialize.err, result.error);
    return isPromiseLike(serialized)
      ? Promise.resolve(serialized).then(finishErrSerialization)
      : finishErrSerialization(serialized);
  }

  const finishOkDeserialization = (
    resolved: Result<StandardSchemaOutput<TOkDeserialize>, ResultDeserializationError>,
  ): DeserializeResult => {
    if (resolved.status === "error") {
      return err(resolved.error);
    }
    return ok(resolved.value);
  };

  const finishErrDeserialization = (
    resolved: Result<StandardSchemaOutput<TErrDeserialize>, ResultDeserializationError>,
  ): DeserializeResult => {
    if (resolved.status === "error") {
      return err(resolved.error);
    }
    return err(resolved.value);
  };

  function deserializeResult(
    value: SerializedOkEnvelope,
  ): StandardSchemaOperationResult<DeserializeResult, TOkDeserialize>;
  function deserializeResult(
    value: SerializedErrEnvelope,
  ): StandardSchemaOperationResult<DeserializeResult, TErrDeserialize>;
  function deserializeResult(
    value: unknown,
  ): UnknownDeserializationResult<TOkDeserialize, TErrDeserialize>;
  function deserializeResult(value: unknown): DeserializeResult | Promise<DeserializeResult> {
    if (!isSerializedResultEnvelope(value)) {
      return err(new ResultDeserializationError({ value }));
    }
    if (value.status === "ok") {
      const deserialized = deserializeWithSchema(config.deserialize.ok, value.value);
      return isPromiseLike(deserialized)
        ? Promise.resolve(deserialized).then(finishOkDeserialization)
        : finishOkDeserialization(deserialized);
    }
    const deserialized = deserializeWithSchema(config.deserialize.err, value.error);
    return isPromiseLike(deserialized)
      ? Promise.resolve(deserialized).then(finishErrDeserialization)
      : finishErrDeserialization(deserialized);
  }

  return {
    serialize: serializeResult,
    deserialize: deserializeResult,
  } satisfies ResultCodec<TOkSerialize, TErrSerialize, TOkDeserialize, TErrDeserialize>;
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
   * // Basic retry with cancellation forwarded to each attempt and retry delay
   * await Result.tryPromise(({ signal }) => fetch(url, { signal }), {
   *   signal: abortController.signal,
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
   * Builds a Result-level codec from Standard Schema-compatible serializers/deserializers.
   *
   * @example
   * const UserResultCodec = Result.codec({
   *   serialize: { ok: UserToWireSchema, err: AppErrorToWireSchema },
   *   deserialize: { ok: WireToUserSchema, err: WireToAppErrorSchema },
   * });
   *
   * const outbound = UserResultCodec.serialize(Result.ok(user));
   * const inbound = outbound.andThen((wire) => UserResultCodec.deserialize(wire));
   */
  codec,
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
