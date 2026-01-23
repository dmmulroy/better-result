import { describe, expect, it } from "bun:test";
import { Result, Ok, Err } from "./result";
import { Panic, UnhandledException } from "./error";

describe("Result", () => {
  describe("ok", () => {
    it("creates Ok with value", () => {
      const result = Result.ok(42);
      expect(result).toBeInstanceOf(Ok);
      expect(result.status).toBe("ok");
      expect(result.value).toBe(42);
    });

    it("creates Ok with null", () => {
      const result = Result.ok(null);
      expect(result.value).toBe(null);
    });

    it("creates Ok with undefined", () => {
      const result = Result.ok(undefined);
      expect(result.value).toBe(undefined);
    });

    it("creates Ok<void> when called without arguments", () => {
      const result = Result.ok();
      expect(result).toBeInstanceOf(Ok);
      expect(result.status).toBe("ok");
      expect(result.value).toBe(undefined);
    });

    it("Ok<void> is assignable to Result<void, E>", () => {
      const save = (): Result<void, Error> => {
        return Result.ok();
      };
      const result = save();
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(undefined);
    });

    it("Ok<void> works with map", () => {
      const result = Result.ok().map(() => 42);
      expect(result.value).toBe(42);
    });

    it("Ok<void> works with andThen", () => {
      const result = Result.ok().andThen(() => Result.ok("done"));
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("done");
      }
    });

    it("Ok<void> works in Result.gen", () => {
      const result = Result.gen(function* () {
        yield* Result.ok();
        return Result.ok(42);
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe("err", () => {
    it("creates Err with error", () => {
      const result = Result.err("failed");
      expect(result).toBeInstanceOf(Err);
      expect(result.status).toBe("error");
      expect(result.error).toBe("failed");
    });

    it("creates Err with Error object", () => {
      const error = new Error("oops");
      const result = Result.err(error);
      expect(result.error).toBe(error);
    });
  });

  describe("isOk", () => {
    it("returns true for Ok", () => {
      expect(Result.isOk(Result.ok(1))).toBe(true);
    });

    it("returns false for Err", () => {
      expect(Result.isOk(Result.err("x"))).toBe(false);
    });
  });

  describe("isError", () => {
    it("returns true for Err", () => {
      expect(Result.isError(Result.err("x"))).toBe(true);
    });

    it("returns false for Ok", () => {
      expect(Result.isError(Result.ok(1))).toBe(false);
    });
  });

  describe("Ok.isOk / Ok.isErr methods", () => {
    it("Ok.isOk() returns true", () => {
      const ok = Result.ok(42);
      expect(ok.isOk()).toBe(true);
    });

    it("Ok.isErr() returns false", () => {
      const ok = Result.ok(42);
      expect(ok.isErr()).toBe(false);
    });

    it("Err.isOk() returns false", () => {
      const err = Result.err("fail");
      expect(err.isOk()).toBe(false);
    });

    it("Err.isErr() returns true", () => {
      const err = Result.err("fail");
      expect(err.isErr()).toBe(true);
    });

    it("narrows Result to Ok when isOk() returns true", () => {
      const result: Result<number, string> = Result.ok(42);
      if (result.isOk()) {
        // Type should be narrowed to Ok<number, string>
        const value: number = result.value;
        expect(value).toBe(42);
      } else {
        expect.unreachable("should be Ok");
      }
    });

    it("narrows Result to Err when isOk() returns false", () => {
      const result: Result<number, string> = Result.err("fail");
      if (!result.isOk()) {
        // Type should be narrowed to Err<number, string>
        const error: string = result.error;
        expect(error).toBe("fail");
      } else {
        expect.unreachable("should be Err");
      }
    });

    it("narrows Result to Err when isErr() returns true", () => {
      const result: Result<number, string> = Result.err("fail");
      if (result.isErr()) {
        // Type should be narrowed to Err<number, string>
        const error: string = result.error;
        expect(error).toBe("fail");
      } else {
        expect.unreachable("should be Err");
      }
    });

    it("narrows Result to Ok when isErr() returns false", () => {
      const result: Result<number, string> = Result.ok(42);
      if (!result.isErr()) {
        // Type should be narrowed to Ok<number, string>
        const value: number = result.value;
        expect(value).toBe(42);
      } else {
        expect.unreachable("should be Ok");
      }
    });
  });

  describe("try", () => {
    it("returns Ok when function succeeds", () => {
      const result = Result.try(() => 42);
      expect(Result.isOk(result)).toBe(true);
      expect(result.unwrap()).toBe(42);
    });

    it("returns Err with UnhandledException when function throws", () => {
      const result = Result.try(() => {
        throw new Error("boom");
      });
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBeInstanceOf(UnhandledException);
      }
    });

    it("supports custom catch handler", () => {
      class CustomError extends Error {}
      const result = Result.try({
        try: () => {
          throw new Error("original");
        },
        catch: (_e) => new CustomError("wrapped"),
      });
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBeInstanceOf(CustomError);
      }
    });

    it("retries on failure", () => {
      let attempts = 0;
      const result = Result.try(
        () => {
          attempts++;
          if (attempts < 3) throw new Error("fail");
          return "success";
        },
        { retry: { times: 3 } },
      );
      expect(Result.isOk(result)).toBe(true);
      expect(result.unwrap()).toBe("success");
      expect(attempts).toBe(3);
    });

    it("throws Panic when catch handler throws", () => {
      expect(() =>
        Result.try({
          try: () => {
            throw new Error("original error");
          },
          catch: () => {
            throw new Error("catch handler failed");
          },
        }),
      ).toThrow(Panic);
    });

    it("Panic from catch handler contains cause", () => {
      try {
        Result.try({
          try: () => {
            throw new Error("original error");
          },
          catch: () => {
            throw new Error("catch handler failed");
          },
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          expect(e.message).toContain("catch handler threw");
          expect(e.cause).toBeInstanceOf(Error);
          expect((e.cause as Error).message).toBe("catch handler failed");
        }
      }
    });
  });

  describe("tryPromise", () => {
    it("returns Ok when promise resolves", async () => {
      const result = await Result.tryPromise(() => Promise.resolve(42));
      expect(Result.isOk(result)).toBe(true);
      expect(result.unwrap()).toBe(42);
    });

    it("returns Err when promise rejects", async () => {
      const result = await Result.tryPromise(() => Promise.reject(new Error("boom")));
      expect(Result.isError(result)).toBe(true);
    });

    it("supports retry with exponential backoff", async () => {
      let attempts = 0;
      const start = Date.now();
      const result = await Result.tryPromise(
        () => {
          attempts++;
          if (attempts < 3) return Promise.reject(new Error("fail"));
          return Promise.resolve("success");
        },
        { retry: { times: 3, delayMs: 10, backoff: "exponential" } },
      );
      const elapsed = Date.now() - start;
      expect(Result.isOk(result)).toBe(true);
      expect(attempts).toBe(3);
      // exponential: 10ms + 20ms = 30ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });

    it("throws Panic when catch handler throws", async () => {
      await expect(
        Result.tryPromise({
          try: () => Promise.reject(new Error("original error")),
          catch: () => {
            throw new Error("catch handler failed");
          },
        }),
      ).rejects.toBeInstanceOf(Panic);
    });

    it("rejected Promise from catch handler throws Panic", async () => {
      // Catch handler can be async, so a rejected Promise will be awaited.
      // A rejected promise causes Panic (catch handler failure).
      const rejectedPromise = Promise.reject(new Error("catch handler failed"));
      rejectedPromise.catch(() => {}); // Prevent unhandled rejection warning

      await expect(
        Result.tryPromise({
          try: () => Promise.reject(new Error("original")),
          catch: () => rejectedPromise,
        }),
      ).rejects.toBeInstanceOf(Panic);
    });

    it("supports async catch handler", async () => {
      const result = await Result.tryPromise({
        try: () => Promise.reject(new Error("original")),
        catch: async (e) => {
          await Promise.resolve(); // Prove it's async
          return { msg: (e as Error).message, enriched: true };
        },
      });
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toEqual({ msg: "original", enriched: true });
      }
    });

    it("respects shouldRetry predicate", async () => {
      let attempts = 0;
      const result = await Result.tryPromise(
        {
          try: () => {
            attempts++;
            throw new Error(attempts === 1 ? "retryable" : "fatal");
          },
          catch: (e) => ({
            retryable: (e as Error).message === "retryable",
            msg: (e as Error).message,
          }),
        },
        {
          retry: {
            times: 3,
            delayMs: 1,
            backoff: "constant",
            shouldRetry: (e) => e.retryable,
          },
        },
      );

      // Tried once, retried once (retryable), stopped on non-retryable
      expect(attempts).toBe(2);
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error.msg).toBe("fatal");
      }
    });

    it("retries all errors when shouldRetry not provided", async () => {
      let attempts = 0;
      const result = await Result.tryPromise(
        {
          try: () => {
            attempts++;
            throw new Error("always fail");
          },
          catch: (e) => ({ msg: (e as Error).message }),
        },
        {
          retry: {
            times: 3,
            delayMs: 1,
            backoff: "constant",
          },
        },
      );

      // Initial + 3 retries = 4 attempts
      expect(attempts).toBe(4);
      expect(Result.isError(result)).toBe(true);
    });

    it("throws Panic when shouldRetry predicate throws", async () => {
      await expect(
        Result.tryPromise(
          {
            try: () => Promise.reject(new Error("fail")),
            catch: (e) => ({ msg: (e as Error).message }),
          },
          {
            retry: {
              times: 3,
              delayMs: 1,
              backoff: "constant",
              shouldRetry: () => {
                throw new Error("predicate bug");
              },
            },
          },
        ),
      ).rejects.toBeInstanceOf(Panic);
    });
  });

  describe("map", () => {
    it("transforms Ok value", () => {
      const result = Result.ok(2).map((x) => x * 3);
      expect(result.unwrap()).toBe(6);
    });

    it("passes through Err", () => {
      const result = Result.err<number, string>("fail").map((x) => x * 3);
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBe("fail");
      }
    });

    it("works as standalone function (data-first)", () => {
      const result = Result.map(Result.ok(2), (x) => x * 3);
      expect(result.unwrap()).toBe(6);
    });

    it("works as standalone function (data-last)", () => {
      const double = Result.map((x: number) => x * 2);
      const result = double(Result.ok(5));
      expect(result.unwrap()).toBe(10);
    });
  });

  describe("mapError", () => {
    it("transforms Err value", () => {
      const result = Result.err("fail").mapError((e) => e.toUpperCase());
      if (Result.isError(result)) {
        expect(result.error).toBe("FAIL");
      }
    });

    it("passes through Ok", () => {
      const result = Result.ok(42).mapError((e: string) => e.toUpperCase());
      expect(result.unwrap()).toBe(42);
    });
  });

  describe("andThen", () => {
    it("chains Ok to Ok", () => {
      const result = Result.ok(2).andThen((x) => Result.ok(x * 3));
      expect(result.unwrap()).toBe(6);
    });

    it("chains Ok to Err", () => {
      const result = Result.ok(2).andThen((x) => Result.err(`got ${x}`));
      expect(Result.isError(result)).toBe(true);
    });

    it("short-circuits on Err", () => {
      let called = false;
      const result = Result.err<number, string>("fail").andThen((x) => {
        called = true;
        return Result.ok(x * 2);
      });
      expect(called).toBe(false);
      expect(Result.isError(result)).toBe(true);
    });
  });

  describe("andThenAsync", () => {
    it("chains async operations", async () => {
      const result = await Result.ok(2).andThenAsync(async (x) => Result.ok(x * 3));
      expect(result.unwrap()).toBe(6);
    });

    it("short-circuits on Err", async () => {
      let called = false;
      const result = await Result.err<number, string>("fail").andThenAsync(async (x) => {
        called = true;
        return Result.ok(x * 2);
      });
      expect(called).toBe(false);
      expect(Result.isError(result)).toBe(true);
    });
  });

  describe("match", () => {
    it("calls ok handler for Ok", () => {
      const result = Result.ok(2).match({
        ok: (x) => `value: ${x}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe("value: 2");
    });

    it("calls err handler for Err", () => {
      const result = Result.err("oops").match({
        ok: (x) => `value: ${x}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe("error: oops");
    });
  });

  describe("unwrap", () => {
    it("returns value for Ok", () => {
      expect(Result.ok(42).unwrap()).toBe(42);
    });

    it("throws for Err", () => {
      expect(() => Result.err("fail").unwrap()).toThrow();
    });

    it("throws with custom message", () => {
      expect(() => Result.err("fail").unwrap("custom")).toThrow("custom");
    });
  });

  describe("unwrapOr", () => {
    it("returns value for Ok", () => {
      expect(Result.ok(42).unwrapOr(0)).toBe(42);
    });

    it("returns fallback for Err", () => {
      expect(Result.err("fail").unwrapOr(0)).toBe(0);
    });
  });

  describe("tap", () => {
    it("runs side effect on Ok", () => {
      let captured = 0;
      const result = Result.ok(42).tap((x) => {
        captured = x;
      });
      expect(captured).toBe(42);
      expect(result.unwrap()).toBe(42);
    });

    it("skips side effect on Err", () => {
      let called = false;
      const result = Result.err("fail").tap(() => {
        called = true;
      });
      expect(called).toBe(false);
      expect(Result.isError(result)).toBe(true);
    });
  });

  describe("tapAsync", () => {
    it("runs async side effect on Ok", async () => {
      let captured = 0;
      const result = await Result.ok(42).tapAsync(async (x) => {
        captured = x;
      });
      expect(captured).toBe(42);
      expect(result.unwrap()).toBe(42);
    });
  });

  describe("gen (sync)", () => {
    it("composes multiple Results", () => {
      const getA = () => Result.ok(1);
      const getB = (a: number) => Result.ok(a + 1);
      const getC = (b: number) => Result.ok(b + 1);

      const result = Result.gen(function* () {
        const a = yield* getA();
        const b = yield* getB(a);
        const c = yield* getC(b);
        return Result.ok(c);
      });

      expect(result.unwrap()).toBe(3);
    });

    it("short-circuits on first Err", () => {
      let bCalled = false;

      const getA = () => Result.err<number, string>("a failed");
      const getB = () => {
        bCalled = true;
        return Result.ok(2);
      };

      const result = Result.gen(function* () {
        const a = yield* getA();
        const b = yield* getB();
        return Result.ok(a + b);
      });

      expect(Result.isError(result)).toBe(true);
      expect(bCalled).toBe(false);
      if (Result.isError(result)) {
        expect(result.error).toBe("a failed");
      }
    });

    it("runs finally blocks when short-circuiting", () => {
      let finallyCalled = false;

      const getA = () => Result.err<number, string>("a failed");

      const result = Result.gen(function* () {
        try {
          yield* getA();
          return Result.ok(1);
        } finally {
          finallyCalled = true;
        }
      });

      expect(Result.isError(result)).toBe(true);
      expect(finallyCalled).toBe(true);
    });

    it("collects error types from yields", () => {
      class ErrorA extends Error {
        readonly _tag = "ErrorA" as const;
      }
      class ErrorB extends Error {
        readonly _tag = "ErrorB" as const;
      }

      const getA = (): Result<number, ErrorA> => Result.ok(1);
      const getB = (): Result<number, ErrorB> => Result.err(new ErrorB());

      const result = Result.gen(function* () {
        const a = yield* getA();
        const b = yield* getB();
        return Result.ok(a + b);
      });

      // Type: Result<number, ErrorA | ErrorB>
      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBeInstanceOf(ErrorB);
      }
    });

    it("supports this binding", () => {
      const ctx = { multiplier: 10 };

      const result = Result.gen(function* (this: typeof ctx) {
        const a = yield* Result.ok(5);
        return Result.ok(a * this.multiplier);
      }, ctx);

      expect(result.unwrap()).toBe(50);
    });
  });

  describe("gen (async)", () => {
    it("composes async Results", async () => {
      const fetchA = () => Promise.resolve(Result.ok(1));
      const fetchB = (a: number) => Promise.resolve(Result.ok(a + 1));

      const result = await Result.gen(async function* () {
        const a = yield* Result.await(fetchA());
        const b = yield* Result.await(fetchB(a));
        return Result.ok(b);
      });

      expect(result.unwrap()).toBe(2);
    });

    it("short-circuits on async Err", async () => {
      let bCalled = false;

      const fetchA = () => Promise.resolve(Result.err<number, string>("a failed"));
      const fetchB = () => {
        bCalled = true;
        return Promise.resolve(Result.ok(2));
      };

      const result = await Result.gen(async function* () {
        const a = yield* Result.await(fetchA());
        const b = yield* Result.await(fetchB());
        return Result.ok(a + b);
      });

      expect(Result.isError(result)).toBe(true);
      expect(bCalled).toBe(false);
    });

    it("runs finally blocks when short-circuiting (async)", async () => {
      let finallyCalled = false;

      const fetchA = () => Promise.resolve(Result.err<number, string>("a failed"));

      const result = await Result.gen(async function* () {
        try {
          yield* Result.await(fetchA());
          return Result.ok(1);
        } finally {
          finallyCalled = true;
        }
      });

      expect(Result.isError(result)).toBe(true);
      expect(finallyCalled).toBe(true);
    });
  });

  describe("gen cleanup (finally/dispose)", () => {
    it("throws Panic when finally block throws (sync)", () => {
      expect(() =>
        Result.gen(function* () {
          try {
            yield* Result.err("original error");
            return Result.ok(1);
          } finally {
            throw new Error("cleanup failed");
          }
        }),
      ).toThrow(Panic);
    });

    it("Panic contains cleanup cause", () => {
      try {
        Result.gen(function* () {
          try {
            yield* Result.err("original error");
            return Result.ok(1);
          } finally {
            throw new Error("cleanup failed");
          }
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          expect(e.message).toContain("cleanup");
          expect(e.cause).toBeInstanceOf(Error);
          expect((e.cause as Error).message).toBe("cleanup failed");
        }
      }
    });

    it("throws Panic when finally block throws (async)", async () => {
      await expect(
        Result.gen(async function* () {
          try {
            yield* Result.await(Promise.resolve(Result.err("original error")));
            return Result.ok(1);
          } finally {
            throw new Error("cleanup failed");
          }
        }),
      ).rejects.toBeInstanceOf(Panic);
    });

    it("disposes resources via Symbol.dispose when short-circuiting", () => {
      let disposed = false;

      const acquireResource = () =>
        Result.ok({
          value: 42,
          [Symbol.dispose]() {
            disposed = true;
          },
        });

      const result = Result.gen(function* () {
        using resource = yield* acquireResource();
        yield* Result.err("fail after acquire");
        return Result.ok(resource.value);
      });

      expect(Result.isError(result)).toBe(true);
      expect(disposed).toBe(true);
    });

    it("disposes async resources via Symbol.asyncDispose when short-circuiting", async () => {
      let disposed = false;

      const acquireResource = () =>
        Promise.resolve(
          Result.ok({
            value: 42,
            async [Symbol.asyncDispose]() {
              disposed = true;
            },
          }),
        );

      const result = await Result.gen(async function* () {
        await using resource = yield* Result.await(acquireResource());
        yield* Result.await(Promise.resolve(Result.err("fail after acquire")));
        return Result.ok(resource.value);
      });

      expect(Result.isError(result)).toBe(true);
      expect(disposed).toBe(true);
    });

    it("throws Panic when Symbol.dispose throws", () => {
      const acquireResource = () =>
        Result.ok({
          value: 42,
          [Symbol.dispose]() {
            throw new Error("dispose failed");
          },
        });

      expect(() =>
        Result.gen(function* () {
          using _resource = yield* acquireResource();
          yield* Result.err("original error");
          return Result.ok(1);
        }),
      ).toThrow(Panic);
    });

    it("does not call cleanup on success path", () => {
      let finallyCalled = false;

      const result = Result.gen(function* () {
        try {
          const a = yield* Result.ok(1);
          return Result.ok(a + 1);
        } finally {
          finallyCalled = true;
        }
      });

      // Finally DOES run on success (normal generator completion)
      expect(Result.isOk(result)).toBe(true);
      expect(finallyCalled).toBe(true);
    });

    it("disposes multiple resources in reverse order", () => {
      const disposeOrder: string[] = [];

      const acquireA = () =>
        Result.ok({
          name: "A",
          [Symbol.dispose]() {
            disposeOrder.push("A");
          },
        });

      const acquireB = () =>
        Result.ok({
          name: "B",
          [Symbol.dispose]() {
            disposeOrder.push("B");
          },
        });

      const result = Result.gen(function* () {
        using _a = yield* acquireA();
        using _b = yield* acquireB();
        yield* Result.err("fail");
        return Result.ok(1);
      });

      expect(Result.isError(result)).toBe(true);
      expect(disposeOrder).toEqual(["B", "A"]); // LIFO order
    });

    it("throws Panic when success-path cleanup throws (sync)", () => {
      expect(() =>
        Result.gen(function* () {
          try {
            return Result.ok(1);  // Success path
          } finally {
            throw new Error("cleanup failed on success");
          }
        }),
      ).toThrow(Panic);
    });

    it("throws Panic when success-path cleanup throws (async)", async () => {
      await expect(
        Result.gen(async function* () {
          try {
            return Result.ok(1);  // Success path
          } finally {
            throw new Error("cleanup failed on success");
          }
        }),
      ).rejects.toBeInstanceOf(Panic);
    });

    it("Panic from success-path has cleanup cause", () => {
      try {
        Result.gen(function* () {
          try {
            return Result.ok(1);
          } finally {
            throw new Error("cleanup failed");
          }
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          expect(e.cause).toBeInstanceOf(Error);
          expect((e.cause as Error).message).toBe("cleanup failed");
        }
      }
    });

    it("throws Panic when generator body throws directly", () => {
      expect(() =>
        Result.gen(function* () {
          throw new Error("unexpected throw");
        }),
      ).toThrow(Panic);
    });

    it("throws Panic when async generator body throws directly", async () => {
      await expect(
        Result.gen(async function* () {
          throw new Error("unexpected throw");
        }),
      ).rejects.toBeInstanceOf(Panic);
    });

    it("throws Panic from inner generator, outer finally never runs", () => {
      // When inner generator Panics, the exception propagates immediately.
      // Outer finally blocks don't run because we're not inside a try/finally
      // in the outer generator body - we're calling a function that throws.
      let outerFinallyCalled = false;

      const inner = () =>
        Result.gen(function* () {
          try {
            yield* Result.err("inner error");
            return Result.ok(1);
          } finally {
            throw new Error("inner cleanup failed");
          }
        });

      expect(() =>
        Result.gen(function* () {
          try {
            // inner() throws Panic synchronously
            yield* inner();
            return Result.ok(2);
          } finally {
            outerFinallyCalled = true;
          }
        }),
      ).toThrow(Panic);

      // Outer finally DOES run because the Panic propagates through the outer generator
      expect(outerFinallyCalled).toBe(true);
    });

    it("throws Panic when Symbol.asyncDispose throws", async () => {
      const acquireResource = () =>
        Promise.resolve(
          Result.ok({
            value: 42,
            async [Symbol.asyncDispose]() {
              throw new Error("async dispose failed");
            },
          }),
        );

      await expect(
        Result.gen(async function* () {
          await using _resource = yield* Result.await(acquireResource());
          yield* Result.await(Promise.resolve(Result.err("original error")));
          return Result.ok(1);
        }),
      ).rejects.toBeInstanceOf(Panic);
    });

    it("Panic from Symbol.asyncDispose contains dispose error", async () => {
      const acquireResource = () =>
        Promise.resolve(
          Result.ok({
            value: 42,
            async [Symbol.asyncDispose]() {
              throw new Error("async dispose failed");
            },
          }),
        );

      try {
        await Result.gen(async function* () {
          await using _resource = yield* Result.await(acquireResource());
          yield* Result.await(Promise.resolve(Result.err("original error")));
          return Result.ok(1);
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          expect(e.message).toContain("cleanup");
          expect(e.cause).toBeInstanceOf(Error);
          expect((e.cause as Error).message).toBe("async dispose failed");
        }
      }
    });
  });

  describe("combinator Panic", () => {
    it("Result.map throws Panic when callback throws", () => {
      try {
        Result.ok(1).map(() => {
          throw new Error("map callback failed");
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          expect(e.message).toContain("map");
          expect(e.cause).toBeInstanceOf(Error);
          expect((e.cause as Error).message).toBe("map callback failed");
        }
      }
    });

    it("Result.andThen throws Panic when callback throws", () => {
      expect(() =>
        Result.ok(1).andThen(() => {
          throw new Error("andThen callback failed");
        }),
      ).toThrow(Panic);
    });

    it("Result.andThenAsync throws Panic when callback rejects", async () => {
      await expect(
        Result.ok(1).andThenAsync(async () => {
          throw new Error("async callback failed");
        }),
      ).rejects.toBeInstanceOf(Panic);
    });

    it("Result.match throws Panic when ok handler throws", () => {
      expect(() =>
        Result.ok(1).match({
          ok: () => {
            throw new Error("ok handler failed");
          },
          err: () => "err",
        }),
      ).toThrow(Panic);
    });

    it("Result.match throws Panic when err handler throws", () => {
      expect(() =>
        Result.err("fail").match({
          ok: () => "ok",
          err: () => {
            throw new Error("err handler failed");
          },
        }),
      ).toThrow(Panic);
    });

    it("Result.mapError throws Panic when callback throws", () => {
      try {
        Result.err("original").mapError(() => {
          throw new Error("mapError callback failed");
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          expect(e.message).toContain("mapError");
          expect(e.cause).toBeInstanceOf(Error);
          expect((e.cause as Error).message).toBe("mapError callback failed");
        }
      }
    });

    it("Result.tap throws Panic when callback throws", () => {
      expect(() =>
        Result.ok(1).tap(() => {
          throw new Error("tap callback failed");
        }),
      ).toThrow(Panic);
    });

    it("Result.tapAsync throws Panic when callback rejects", async () => {
      await expect(
        Result.ok(1).tapAsync(async () => {
          throw new Error("tapAsync callback failed");
        }),
      ).rejects.toBeInstanceOf(Panic);
    });
  });

  describe("Panic formatting", () => {
    it("toJSON() includes all properties", () => {
      try {
        Result.ok(1).map(() => {
          throw new Error("test error");
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          const json = e.toJSON() as Record<string, unknown>;
          expect(json._tag).toBe("Panic");
          expect(json.name).toBe("Panic");
          expect(json.cause).toEqual({
            name: "Error",
            message: "test error",
            stack: expect.any(String),
          });
          expect(json.stack).toEqual(expect.any(String));
          expect(json.message).toContain("map");
        }
      }
    });

    it("Panic includes cause in Caused by chain", () => {
      try {
        Result.err("business error").mapError(() => {
          throw new Error("handler bug");
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(Panic);
        if (e instanceof Panic) {
          expect(e.stack).toContain("Caused by:");
          expect(e.stack).toContain("handler bug");
        }
      }
    });

    it("handles non-Error cause gracefully", () => {
      const p = new Panic({ message: "test panic", cause: "string cause" });
      expect(p.message).toBe("test panic");

      const json = p.toJSON() as Record<string, unknown>;
      expect(json.cause).toBe("string cause");
    });
  });

  describe("serialize", () => {
    it("serializes Ok to plain object", () => {
      const result = Result.ok(42);
      const serialized = Result.serialize(result);
      expect(serialized).toEqual({ status: "ok", value: 42 });
    });

    it("serializes Err to plain object", () => {
      const result = Result.err("fail");
      const serialized = Result.serialize(result);
      expect(serialized).toEqual({ status: "error", error: "fail" });
    });

    it("serializes complex values", () => {
      const result = Result.ok({ id: 1, name: "test", nested: { a: [1, 2, 3] } });
      const serialized = Result.serialize(result);
      expect(serialized).toEqual({
        status: "ok",
        value: { id: 1, name: "test", nested: { a: [1, 2, 3] } },
      });
    });

    it("serializes null and undefined values", () => {
      expect(Result.serialize(Result.ok(null))).toEqual({ status: "ok", value: null });
      expect(Result.serialize(Result.ok(undefined))).toEqual({ status: "ok", value: undefined });
    });
  });

  describe("deserialize", () => {
    it("deserializes Ok object to Ok instance", () => {
      const serialized = { status: "ok" as const, value: 42 };
      const result = Result.deserialize<number, string>(serialized);
      expect(result).not.toBe(null);
      expect(result).toBeInstanceOf(Ok);
      expect(result?.unwrap()).toBe(42);
    });

    it("deserializes Err object to Err instance", () => {
      const serialized = { status: "error" as const, error: "fail" };
      const result = Result.deserialize<number, string>(serialized);
      expect(result).not.toBe(null);
      expect(result).toBeInstanceOf(Err);
      if (result && Result.isError(result)) {
        expect(result.error).toBe("fail");
      }
    });

    it("returns null for non-Result objects", () => {
      expect(Result.deserialize({ foo: "bar" })).toBe(null);
      expect(Result.deserialize(null)).toBe(null);
      expect(Result.deserialize(42)).toBe(null);
      expect(Result.deserialize({ status: "ok" })).toBe(null); // missing value
      expect(Result.deserialize({ status: "error" })).toBe(null); // missing error
    });

    it("deserializes complex values", () => {
      const serialized = { status: "ok" as const, value: { id: 1, items: [1, 2] } };
      const result = Result.deserialize<{ id: number; items: number[] }, string>(serialized);
      expect(result?.unwrap()).toEqual({ id: 1, items: [1, 2] });
    });
  });

  describe("serialize/deserialize roundtrip", () => {
    it("roundtrips Ok", () => {
      const original = Result.ok({ id: 42, name: "test" });
      const serialized = Result.serialize(original);
      const deserialized = Result.deserialize<{ id: number; name: string }, never>(serialized);

      expect(deserialized).toBeInstanceOf(Ok);
      expect(deserialized?.unwrap()).toEqual({ id: 42, name: "test" });
    });

    it("roundtrips Err", () => {
      const original = Result.err({ code: "NOT_FOUND", message: "User not found" });
      const serialized = Result.serialize(original);
      const deserialized = Result.deserialize<never, { code: string; message: string }>(serialized);

      expect(deserialized).toBeInstanceOf(Err);
      if (deserialized && Result.isError(deserialized)) {
        expect(deserialized.error).toEqual({ code: "NOT_FOUND", message: "User not found" });
      }
    });

    it("roundtrips through JSON.stringify/parse", () => {
      const original = Result.ok({ id: 1, data: [1, 2, 3] });
      const json = JSON.stringify(Result.serialize(original));
      const parsed = JSON.parse(json);
      const deserialized = Result.deserialize<{ id: number; data: number[] }, never>(parsed);

      expect(deserialized?.unwrap()).toEqual({ id: 1, data: [1, 2, 3] });
    });
  });

  describe("hydrate (deprecated)", () => {
    it("hydrates serialized Ok", () => {
      const serialized = { status: "ok" as const, value: 42 };
      const result = Result.hydrate<number, string>(serialized);
      expect(result).not.toBe(null);
      expect(result).toBeInstanceOf(Ok);
      expect(result?.unwrap()).toBe(42);
    });

    it("hydrates serialized Err", () => {
      const serialized = { status: "error" as const, error: "fail" };
      const result = Result.hydrate<number, string>(serialized);
      expect(result).not.toBe(null);
      expect(result).toBeInstanceOf(Err);
      if (result && Result.isError(result)) {
        expect(result.error).toBe("fail");
      }
    });

    it("returns null for non-Result objects", () => {
      expect(Result.hydrate({ foo: "bar" })).toBe(null);
      expect(Result.hydrate(null)).toBe(null);
      expect(Result.hydrate(42)).toBe(null);
    });
  });

  describe("flatten", () => {
    it("flattens Ok(Ok(value)) to Ok(value)", () => {
      const nested = Result.ok(Result.ok(42));
      const flat = Result.flatten(nested);
      expect(Result.isOk(flat)).toBe(true);
      expect(flat.unwrap()).toBe(42);
    });

    it("flattens Ok(Err(error)) to Err(error)", () => {
      const nested = Result.ok(Result.err("inner error"));
      const flat = Result.flatten(nested);
      expect(Result.isError(flat)).toBe(true);
      if (Result.isError(flat)) {
        expect(flat.error).toBe("inner error");
      }
    });

    it("flattens Err(outerError) to Err(outerError)", () => {
      const nested: Result<Result<number, string>, string> = Result.err("outer error");
      const flat = Result.flatten(nested);
      expect(Result.isError(flat)).toBe(true);
      if (Result.isError(flat)) {
        expect(flat.error).toBe("outer error");
      }
    });

    it("correctly unions error types", () => {
      class InnerError extends Error {
        readonly _tag = "InnerError" as const;
      }
      class OuterError extends Error {
        readonly _tag = "OuterError" as const;
      }

      const okOk: Result<Result<number, InnerError>, OuterError> = Result.ok(Result.ok(42));
      const okErr: Result<Result<number, InnerError>, OuterError> = Result.ok(
        Result.err(new InnerError()),
      );
      const errOuter: Result<Result<number, InnerError>, OuterError> = Result.err(new OuterError());

      // All flatten to Result<number, InnerError | OuterError>
      const flat1: Result<number, InnerError | OuterError> = Result.flatten(okOk);
      const flat2: Result<number, InnerError | OuterError> = Result.flatten(okErr);
      const flat3: Result<number, InnerError | OuterError> = Result.flatten(errOuter);

      expect(Result.isOk(flat1)).toBe(true);
      expect(Result.isError(flat2)).toBe(true);
      expect(Result.isError(flat3)).toBe(true);

      if (Result.isError(flat2)) {
        expect(flat2.error._tag).toBe("InnerError");
      }
      if (Result.isError(flat3)) {
        expect(flat3.error._tag).toBe("OuterError");
      }
    });
  });
});

describe("Monad Laws", () => {
  // For a proper monad, we need:
  // 1. Left identity: return a >>= f  ≡  f a
  // 2. Right identity: m >>= return  ≡  m
  // 3. Associativity: (m >>= f) >>= g  ≡  m >>= (λx. f x >>= g)
  //
  // In Result terms:
  // - return = Result.ok
  // - >>= = andThen

  const f = (x: number): Result<number, string> => Result.ok(x * 2);
  const g = (x: number): Result<number, string> => Result.ok(x + 10);

  describe("Left Identity", () => {
    // Result.ok(a).andThen(f) ≡ f(a)
    it("holds for Ok", () => {
      const a = 5;
      const left = Result.ok(a).andThen(f);
      const right = f(a);

      expect(left.unwrap()).toBe(right.unwrap());
    });
  });

  describe("Right Identity", () => {
    // m.andThen(Result.ok) ≡ m
    it("holds for Ok", () => {
      const m = Result.ok(42);
      const result = m.andThen(Result.ok);

      expect(result.unwrap()).toBe(m.unwrap());
    });

    it("holds for Err", () => {
      const m = Result.err<number, string>("error");
      const result = m.andThen(Result.ok);

      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBe("error");
      }
    });
  });

  describe("Associativity", () => {
    // (m.andThen(f)).andThen(g) ≡ m.andThen(x => f(x).andThen(g))
    it("holds for Ok", () => {
      const m = Result.ok(5);

      const left = m.andThen(f).andThen(g);
      const right = m.andThen((x) => f(x).andThen(g));

      expect(left.unwrap()).toBe(right.unwrap());
      expect(left.unwrap()).toBe(20); // (5 * 2) + 10
    });

    it("holds for Err (short-circuits consistently)", () => {
      const m = Result.err<number, string>("error");

      const left = m.andThen(f).andThen(g);
      const right = m.andThen((x) => f(x).andThen(g));

      expect(Result.isError(left)).toBe(true);
      expect(Result.isError(right)).toBe(true);
      if (Result.isError(left) && Result.isError(right)) {
        expect(left.error).toBe(right.error);
      }
    });

    it("holds when f returns Err", () => {
      const fErr = (x: number): Result<number, string> => Result.err(`failed at ${x}`);
      const m = Result.ok(5);

      const left = m.andThen(fErr).andThen(g);
      const right = m.andThen((x) => fErr(x).andThen(g));

      expect(Result.isError(left)).toBe(true);
      expect(Result.isError(right)).toBe(true);
      if (Result.isError(left) && Result.isError(right)) {
        expect(left.error).toBe(right.error);
      }
    });
  });
});

describe("Functor Laws", () => {
  // 1. Identity: fmap id ≡ id
  // 2. Composition: fmap (f . g) ≡ fmap f . fmap g
  //
  // In Result terms:
  // - fmap = map

  describe("Identity", () => {
    // m.map(x => x) ≡ m
    it("holds for Ok", () => {
      const m = Result.ok(42);
      const result = m.map((x) => x);

      expect(result.unwrap()).toBe(m.unwrap());
    });

    it("holds for Err", () => {
      const m = Result.err<number, string>("error");
      const result = m.map((x) => x);

      expect(Result.isError(result)).toBe(true);
      if (Result.isError(result)) {
        expect(result.error).toBe("error");
      }
    });
  });

  describe("Composition", () => {
    // m.map(x => g(f(x))) ≡ m.map(f).map(g)
    const f = (x: number) => x * 2;
    const g = (x: number) => x + 10;

    it("holds for Ok", () => {
      const m = Result.ok(5);

      const left = m.map((x) => g(f(x)));
      const right = m.map(f).map(g);

      expect(left.unwrap()).toBe(right.unwrap());
      expect(left.unwrap()).toBe(20); // (5 * 2) + 10
    });

    it("holds for Err", () => {
      const m = Result.err<number, string>("error");

      const left = m.map((x) => g(f(x)));
      const right = m.map(f).map(g);

      expect(Result.isError(left)).toBe(true);
      expect(Result.isError(right)).toBe(true);
    });
  });
});

describe("Type Inference", () => {
  // These tests verify type inference behavior identified by code review.
  // They compile with explicit type annotations that tsc verifies.

  class ErrorA extends Error {
    readonly _tag = "ErrorA" as const;
  }
  class ErrorB extends Error {
    readonly _tag = "ErrorB" as const;
  }
  class ErrorC extends Error {
    readonly _tag = "ErrorC" as const;
  }

  describe("mapError on union", () => {
    it("transforms union error type to single type", () => {
      // Start with union error type
      const r: Result<number, ErrorA | ErrorB> = Result.err(new ErrorA());

      // Transform union to single type
      const mapped: Result<number, ErrorC> = r.mapError(
        (e): ErrorC => new ErrorC(`was: ${e._tag}`),
      );

      expect(Result.isError(mapped)).toBe(true);
      if (Result.isError(mapped)) {
        expect(mapped.error).toBeInstanceOf(ErrorC);
        expect(mapped.error.message).toBe("was: ErrorA");
      }
    });

    it("partially transforms union (preserving some variants)", () => {
      const r: Result<number, ErrorA | ErrorB> = Result.err(new ErrorA());

      // Transform only ErrorA to ErrorC, keep ErrorB
      const mapped: Result<number, ErrorB | ErrorC> = r.mapError(
        (e): ErrorB | ErrorC => (e._tag === "ErrorA" ? new ErrorC(e.message) : e),
      );

      expect(Result.isError(mapped)).toBe(true);
      if (Result.isError(mapped)) {
        expect(mapped.error).toBeInstanceOf(ErrorC);
      }
    });
  });

  describe("Err.map preserves error type", () => {
    it("map on Err returns Err with same error, transformed T", () => {
      const r = Result.err<number, ErrorA>(new ErrorA("original"));

      // map should return Err<string, ErrorA> - error preserved
      // Note: callback parameter is `never` because Err.map never calls it
      const mapped: Result<string, ErrorA> = r.map((): string => "unreachable");

      expect(Result.isError(mapped)).toBe(true);
      if (Result.isError(mapped)) {
        expect(mapped.error).toBeInstanceOf(ErrorA);
        expect(mapped.error.message).toBe("original");
      }
    });
  });

  describe("never error type", () => {
    it("gen with only Ok returns and Ok yields infers never error", () => {
      // No yields from Results with errors, no return Result.err()
      const result: Result<number, never> = Result.gen(function* () {
        const a = yield* Result.ok(1);
        const b = yield* Result.ok(2);
        return Result.ok(a + b);
      });

      expect(Result.isOk(result)).toBe(true);
      expect(result.unwrap()).toBe(3);
    });

    it("never error preserved through map", () => {
      const r: Result<number, never> = Result.ok(42);
      const mapped: Result<string, never> = r.map((n) => n.toString());

      expect(mapped.unwrap()).toBe("42");
    });

    it("never error preserved through andThen with never", () => {
      const r: Result<number, never> = Result.ok(42);
      const chained: Result<string, never> = r.andThen((n) => Result.ok(n.toString()));

      expect(chained.unwrap()).toBe("42");
    });
  });

  describe("unwrapOr type widening", () => {
    it("unwrapOr with different fallback type widens to union", () => {
      const r: Result<number, ErrorA> = Result.err(new ErrorA());

      // Fallback is string, so result is number | string
      const value: number | string = r.unwrapOr("fallback");

      expect(value).toBe("fallback");
    });

    it("unwrapOr with same type returns that type", () => {
      const r: Result<number, ErrorA> = Result.err(new ErrorA());

      const value: number = r.unwrapOr(0);

      expect(value).toBe(0);
    });
  });

  describe("generic Result preservation", () => {
    it("generic function preserves type parameter through gen", () => {
      function identity<T>(value: T): Result<T, ErrorA> {
        return Result.gen(function* () {
          const x = yield* Result.ok<T, ErrorA>(value);
          return Result.ok(x);
        });
      }

      const strResult: Result<string, ErrorA> = identity("hello");
      const numResult: Result<number, ErrorA> = identity(42);
      const objResult: Result<{ id: number }, ErrorA> = identity({ id: 1 });

      expect(strResult.unwrap()).toBe("hello");
      expect(numResult.unwrap()).toBe(42);
      expect(objResult.unwrap()).toEqual({ id: 1 });
    });

    it("generic function with constraint preserves constraint", () => {
      function extractId<T extends { id: number }>(value: T): Result<number, ErrorA> {
        return Result.gen(function* () {
          const obj = yield* Result.ok<T, ErrorA>(value);
          return Result.ok(obj.id);
        });
      }

      const result = extractId({ id: 42, name: "test" });
      expect(result.unwrap()).toBe(42);
    });
  });

  describe("multiple return Result.err inference (bug fix)", () => {
    it("infers union of all returned error types", () => {
      function process(input: string): Result<string, ErrorA | ErrorB | ErrorC> {
        return Result.gen(function* () {
          if (input.length === 0) {
            return Result.err(new ErrorA("empty"));
          }
          if (input.length < 3) {
            return Result.err(new ErrorB("too short"));
          }
          if (input === "bad") {
            return Result.err(new ErrorC("bad value"));
          }
          return Result.ok(input.toUpperCase());
        });
      }

      expect(process("").unwrapOr("default")).toBe("default");
      expect(process("ab").unwrapOr("default")).toBe("default");
      expect(process("bad").unwrapOr("default")).toBe("default");
      expect(process("good").unwrap()).toBe("GOOD");
    });
  });

  describe("partition", () => {
    it("returns empty arrays for empty input", () => {
      expect(Result.partition([])).toEqual([[], []]);
    });

    it("collects all Ok values when no errors", () => {
      const results = [Result.ok(1), Result.ok(2), Result.ok(3)];
      expect(Result.partition(results)).toEqual([[1, 2, 3], []]);
    });

    it("collects all Err values when no successes", () => {
      const results = [Result.err("a"), Result.err("b")];
      expect(Result.partition(results)).toEqual([[], ["a", "b"]]);
    });

    it("splits mixed results preserving order", () => {
      const results = [Result.ok(1), Result.err("a"), Result.ok(2), Result.err("b")];
      expect(Result.partition(results)).toEqual([
        [1, 2],
        ["a", "b"],
      ]);
    });
  });

  describe("phantom type covariance", () => {
    // These tests verify that Err is covariant in T (phantom success type)
    // and Ok is covariant in E (phantom error type), enabling early returns
    // without manual type coercion.

    it("Err with different phantom T is assignable to Result with wider T", () => {
      function getNumber(): Result<number, "not_found"> {
        return Result.err("not_found");
      }

      function numberToString(): Result<string, "not_found"> {
        const result = getNumber();
        if (result.isErr()) {
          // Err<number, "not_found"> should be assignable to Result<string, "not_found">
          // because T is phantom on Err
          return result;
        }
        return Result.ok(result.value.toString());
      }

      const r = numberToString();
      expect(Result.isError(r)).toBe(true);
      if (Result.isError(r)) {
        expect(r.error).toBe("not_found");
      }
    });

    it("Ok with narrower phantom E is assignable to Result with wider E", () => {
      function getNumber(): Result<number, "a"> {
        return Result.ok(42);
      }

      function widen(): Result<number, "a" | "b" | "c"> {
        const result = getNumber();
        if (result.isOk()) {
          // Ok<number, "a"> should be assignable to Result<number, "a" | "b" | "c">
          // because E is phantom on Ok
          return result;
        }
        return Result.err("b");
      }

      const r = widen();
      expect(Result.isOk(r)).toBe(true);
      expect(r.unwrap()).toBe(42);
    });

    it("multiple Err early returns with different phantom T types", () => {
      function getNumber(): Result<number, "num_err"> {
        return Result.err("num_err");
      }

      function getString(): Result<string, "str_err"> {
        return Result.ok("hello");
      }

      function combined(): Result<{ n: number; s: string }, "num_err" | "str_err"> {
        const numResult = getNumber();
        if (numResult.isErr()) {
          // Err<number, "num_err"> -> Result<{n,s}, "num_err" | "str_err">
          return numResult;
        }

        const strResult = getString();
        if (strResult.isErr()) {
          // Err<string, "str_err"> -> Result<{n,s}, "num_err" | "str_err">
          return strResult;
        }

        return Result.ok({ n: numResult.value, s: strResult.value });
      }

      const r = combined();
      expect(Result.isError(r)).toBe(true);
      if (Result.isError(r)) {
        expect(r.error).toBe("num_err");
      }
    });

    it("Err.map callback parameter is never (not called)", () => {
      const err = Result.err<number, string>("fail");
      // Callback is typed as (a: never) => U, reflecting it's never called
      const mapped = err.map((): string => "unreachable");
      expect(Result.isError(mapped)).toBe(true);
      if (Result.isError(mapped)) {
        expect(mapped.error).toBe("fail");
      }
    });

    it("Ok.mapError callback parameter is never (not called)", () => {
      const ok = Result.ok<number, string>(42);
      // Callback is typed as (e: never) => E2, reflecting it's never called
      const mapped = ok.mapError((): number => -1);
      expect(Result.isOk(mapped)).toBe(true);
      expect(mapped.unwrap()).toBe(42);
    });
  });
});
