/** Serialize cause for JSON output */
const serializeCause = (cause: unknown): unknown => {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
};

/** Prevents inference from a type position while supporting TypeScript 5.0. */
type NoInfer<T> = [T][T extends unknown ? 0 : never];

/**
 * Unrecoverable error — user code threw inside Result operations.
 *
 * @example
 * Result.ok(1).map(() => { throw new Error("oops"); });  // Panic!
 */
export class Panic extends Error {
  readonly _tag = "Panic" as const;

  static is(value: unknown): value is Panic {
    return value instanceof Panic;
  }

  constructor(args: { message: string; cause?: unknown }) {
    super(args.message, args.cause !== undefined ? { cause: args.cause } : undefined);
    Object.assign(this, args);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "Panic";

    if (args.cause instanceof Error && args.cause.stack) {
      const indented = args.cause.stack.replace(/\n/g, "\n  ");
      this.stack = `${this.stack}\nCaused by: ${indented}`;
    }
  }

  toJSON(): object {
    return {
      ...this,
      _tag: this._tag,
      name: this.name,
      message: this.message,
      cause: serializeCause(this.cause),
      stack: this.stack,
    };
  }

  /** Makes Panic yieldable in Result.gen blocks like other tagged errors. */
  *[Symbol.iterator](): Generator<Err<never, this>, never, unknown> {
    yield* err(this);
    return panic("Unreachable: Err yielded in Panic but generator continued", this);
  }
}

/** Type guard for Panic instances. */
export const isPanic = (value: unknown): value is Panic => {
  return value instanceof Panic;
};

/** Throw an unrecoverable Panic. */
export const panic = (message: string, cause?: unknown): never => {
  throw new Panic({ message, cause });
};

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

export type TapBothHandlers<A, E> = {
  ok: (a: A) => void;
  err: (e: E) => void;
};

export type TapBothOkHandlers<A> = {
  ok: (a: A) => void;
  err: (e: never) => void;
};

export type TapBothErrHandlers<E> = {
  ok: (a: never) => void;
  err: (e: E) => void;
};

export type TapBothAsyncHandlers<A, E> = {
  ok: (a: A) => Promise<void>;
  err: (e: E) => Promise<void>;
};

export type TapBothAsyncOkHandlers<A> = {
  ok: (a: A) => Promise<void>;
  err: (e: never) => Promise<void>;
};

export type TapBothAsyncErrHandlers<E> = {
  ok: (a: never) => Promise<void>;
  err: (e: E) => Promise<void>;
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

  /** Returns true, narrowing Result to Ok. */
  isOk(): this is Ok<A, E> {
    return true;
  }

  /** Returns false, narrowing Result to Err. */
  isErr(): this is Err<A, E> {
    return false;
  }

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
   * No-op on Ok, returns self with new phantom error type.
   *
   * @template E2 New error type.
   * @param _fn Ignored.
   * @returns Self with updated phantom E type.
   *
   * @example
   * ok(42).tryRecover(() => err("fallback")) // Ok(42)
   */
  tryRecover<E2>(_fn: (e: never) => Result<NoInfer<A>, E2>): Ok<A, E2> {
    // SAFETY: E is phantom on Ok (not used at runtime).
    return this as unknown as Ok<A, E2>;
  }

  /**
   * No-op on Ok, returns Promise of self with new phantom error type.
   *
   * @template E2 New error type.
   * @param _fn Ignored.
   * @returns Promise of self with updated phantom E type.
   *
   * @example
   * await ok(42).tryRecoverAsync(async () => err("fallback")) // Ok(42)
   */
  tryRecoverAsync<E2>(_fn: (e: never) => Promise<Result<NoInfer<A>, E2>>): Promise<Ok<A, E2>> {
    // SAFETY: E is phantom on Ok (not used at runtime).
    return Promise.resolve(this as unknown as Ok<A, E2>);
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
   * No-op on Ok, returns self.
   *
   * @param _fn Ignored.
   * @returns Self.
   */
  tapError(_fn: (e: never) => void): Ok<A, E> {
    return this;
  }

  /**
   * No-op on Ok, returns Promise of self.
   *
   * @param _fn Ignored.
   * @returns Promise of self.
   */
  tapErrorAsync(_fn: (e: never) => Promise<void>): Promise<Ok<A, E>> {
    return Promise.resolve(this);
  }

  /**
   * Runs ok side effect, skips err side effect, returns self.
   *
   * @param handlers Ok and err side effect handlers.
   * @returns Self.
   * @throws {Panic} If ok handler throws.
   */
  tapBoth(handlers: TapBothOkHandlers<A>): Ok<A, E> {
    return tryOrPanic(() => {
      handlers.ok(this.value);
      return this;
    }, "tapBoth ok callback threw");
  }

  /**
   * Runs async ok side effect, skips err side effect, returns self.
   *
   * @param handlers Ok and err async side effect handlers.
   * @returns Promise of self.
   * @throws {Panic} If ok handler throws synchronously or rejects.
   */
  tapBothAsync(handlers: TapBothAsyncOkHandlers<A>): Promise<Ok<A, E>> {
    return tryOrPanicAsync(async () => {
      await handlers.ok(this.value);
      return this;
    }, "tapBothAsync ok callback threw");
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

  /** Returns false, narrowing Result to Ok. */
  isOk(): this is Ok<never, E> {
    return false;
  }

  /** Returns true, narrowing Result to Err. */
  isErr(): this is Err<T, E> {
    return true;
  }

  /**
   * No-op on Err, returns self with new phantom T.
   *
   * @template U New phantom success type.
   * @param _fn Ignored.
   * @returns Self.
   */
  map<U>(_fn: (a: never) => U): Err<U, E> {
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
   * Attempts to recover from Err into the same success type.
   *
   * @template E2 New error type.
   * @param fn Recovery function returning Result with the same success type.
   * @returns Result from fn.
   * @throws {Panic} If fn throws.
   *
   * @example
   * err<number, string>("missing").tryRecover(e => e === "missing" ? ok(0) : err(new Error(e))) // Ok(0)
   */
  tryRecover<E2>(fn: (e: E) => Result<NoInfer<T>, E2>): Result<T, E2> {
    return tryOrPanic(() => fn(this.error), "tryRecover callback threw");
  }

  /**
   * Attempts to recover from Err into the same success type asynchronously.
   *
   * @template E2 New error type.
   * @param fn Async recovery function returning Result with the same success type.
   * @returns Promise of Result from fn.
   * @throws {Panic} If fn throws synchronously or rejects.
   *
   * @example
   * await err<number, string>("missing").tryRecoverAsync(async e => e === "missing" ? ok(0) : err(new Error(e))) // Ok(0)
   */
  tryRecoverAsync<E2>(fn: (e: E) => Promise<Result<NoInfer<T>, E2>>): Promise<Result<T, E2>> {
    return tryOrPanicAsync(() => fn(this.error), "tryRecoverAsync callback threw");
  }

  /**
   * No-op on Err, returns self with widened error type.
   *
   * @template U New phantom success type.
   * @template E2 Additional error type.
   * @param _fn Ignored.
   * @returns Self.
   */
  andThen<U, E2>(_fn: (a: never) => Result<U, E2>): Err<U, E | E2> {
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
  andThenAsync<U, E2>(_fn: (a: never) => Promise<Result<U, E2>>): Promise<Err<U, E | E2>> {
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
  match<R>(handlers: { ok: (a: never) => R; err: (e: E) => R }): R {
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
    return panic(message ?? `Unwrap called on Err: ${String(this.error)}`, this.error);
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
  tap(_fn: (a: never) => void): Err<T, E> {
    return this;
  }

  /**
   * Runs side effect on error, returns self.
   *
   * @param fn Side effect function.
   * @returns Self.
   * @throws {Panic} If fn throws.
   *
   * @example
   * err("fail").tapError(console.error) // logs "fail", returns Err("fail")
   */
  tapError(fn: (e: E) => void): Err<T, E> {
    return tryOrPanic(() => {
      fn(this.error);
      return this;
    }, "tapError callback threw");
  }

  /**
   * No-op on Err, returns Promise of self.
   *
   * @param _fn Ignored.
   * @returns Promise of self.
   */
  tapAsync(_fn: (a: never) => Promise<void>): Promise<Err<T, E>> {
    return Promise.resolve(this);
  }

  /**
   * Runs async side effect on error, returns self.
   *
   * @param fn Async side effect function.
   * @returns Promise of self.
   * @throws {Panic} If fn throws synchronously or rejects.
   *
   * @example
   * await err("fail").tapErrorAsync(async e => await trace("request.failed", { e }))
   */
  tapErrorAsync(fn: (e: E) => Promise<void>): Promise<Err<T, E>> {
    return tryOrPanicAsync(async () => {
      await fn(this.error);
      return this;
    }, "tapErrorAsync callback threw");
  }

  /**
   * Skips ok side effect, runs err side effect, returns self.
   *
   * @param handlers Ok and err side effect handlers.
   * @returns Self.
   * @throws {Panic} If err handler throws.
   */
  tapBoth(handlers: TapBothErrHandlers<E>): Err<T, E> {
    return tryOrPanic(() => {
      handlers.err(this.error);
      return this;
    }, "tapBoth err callback threw");
  }

  /**
   * Skips async ok side effect, runs async err side effect, returns self.
   *
   * @param handlers Ok and err async side effect handlers.
   * @returns Promise of self.
   * @throws {Panic} If err handler throws synchronously or rejects.
   */
  tapBothAsync(handlers: TapBothAsyncErrHandlers<E>): Promise<Err<T, E>> {
    return tryOrPanicAsync(async () => {
      await handlers.err(this.error);
      return this;
    }, "tapBothAsync err callback threw");
  }

  /**
   * Makes Err yieldable in Result.gen blocks.
   * Yields Err<never, E> for proper union inference across multiple yields.
   */
  *[Symbol.iterator](): Generator<Err<never, E>, never, unknown> {
    // SAFETY: T is phantom (not used at runtime). Casting to Err<never, E>
    // ensures all yields have phantom T as `never`, enabling TypeScript to
    // unify: Err<never, E1> | Err<never, E2> extracts to E1 | E2
    yield this as unknown as Err<never, E>;
    return panic("Unreachable: Err yielded in Result.gen but generator continued", this.error);
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
export type AnyResult = Ok<unknown, unknown> | Err<unknown, unknown>;

export function ok(): Ok<void, never>;
export function ok<A, E = never>(value: A): Ok<A, E>;
export function ok(value?: unknown): Ok<unknown, never> {
  return new Ok(value);
}

export const isOk = <A, E>(result: Result<A, E>): result is Ok<A, E> => {
  return result.status === "ok";
};

export const err = <T = never, E = unknown>(error: E): Err<T, E> => new Err<T, E>(error);

export const isError = <T, E>(result: Result<T, E>): result is Err<T, E> => {
  return result.status === "error";
};
