import { describe, expect, it } from "bun:test";
import {
  TaggedError,
  UnhandledException,
  matchError,
  matchErrorPartial,
  isTaggedError,
} from "./error";

class NotFoundError extends TaggedError("NotFoundError")<{
  id: string;
  message: string;
}>() {}

class ValidationError extends TaggedError("ValidationError")<{
  field: string;
  message: string;
}>() {}

class NetworkError extends TaggedError("NetworkError")<{
  url: string;
  message: string;
}>() {}

type AppError = NotFoundError | ValidationError | NetworkError;

describe("TaggedError", () => {
  describe("construction", () => {
    it("sets name to tag", () => {
      const error = new NotFoundError({ id: "123", message: "Not found: 123" });
      expect(error.name).toBe("NotFoundError");
    });

    it("sets message", () => {
      const error = new NotFoundError({ id: "123", message: "Not found: 123" });
      expect(error.message).toBe("Not found: 123");
    });

    it("has _tag discriminator", () => {
      const error = new NotFoundError({ id: "123", message: "Not found" });
      expect(error._tag).toBe("NotFoundError");
    });

    it("preserves custom properties", () => {
      const error = new NotFoundError({ id: "abc", message: "Not found" });
      expect(error.id).toBe("abc");
    });

    it("chains cause in stack trace", () => {
      const cause = new Error("root cause");

      class ErrorWithCause extends TaggedError("ErrorWithCause")<{
        message: string;
        cause: unknown;
      }>() {}

      const error = new ErrorWithCause({ message: "wrapper", cause });
      expect(error.stack).toContain("Caused by:");
      expect(error.stack).toContain("root cause");
    });

    it("indents nested causes", () => {
      const inner = new Error("inner");
      class MiddleError extends TaggedError("MiddleError")<{
        message: string;
        cause: unknown;
      }>() {}
      class OuterError extends TaggedError("OuterError")<{
        message: string;
        cause: unknown;
      }>() {}

      const middle = new MiddleError({ message: "middle", cause: inner });
      const outer = new OuterError({ message: "outer", cause: middle });

      expect(outer.stack).toContain("Caused by:");
      // Should have nested indentation
      const lines = outer.stack?.split("\n") ?? [];
      const causedByLines = lines.filter((l) => l.includes("Caused by:"));
      expect(causedByLines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("isTaggedError", () => {
    it("returns true for TaggedError", () => {
      expect(isTaggedError(new NotFoundError({ id: "x", message: "not found" }))).toBe(true);
    });

    it("returns false for plain Error", () => {
      expect(isTaggedError(new Error())).toBe(false);
    });

    it("returns false for non-errors", () => {
      expect(isTaggedError({ _tag: "fake" })).toBe(false);
    });
  });

  describe("static is() method", () => {
    it("returns true for own instance", () => {
      const err = new NotFoundError({ id: "123", message: "not found" });
      expect(NotFoundError.is(err)).toBe(true);
    });

    it("returns false for different TaggedError", () => {
      const err = new ValidationError({ field: "email", message: "invalid" });
      expect(NotFoundError.is(err)).toBe(false);
    });

    it("returns false for plain Error", () => {
      expect(NotFoundError.is(new Error())).toBe(false);
    });

    it("returns false for non-errors", () => {
      expect(NotFoundError.is({ _tag: "NotFoundError" })).toBe(false);
    });

    it("FooError.is(fooError) is true", () => {
      class FooError extends TaggedError("FooError")<{ message: string }>() {}
      const fooError = new FooError({ message: "foo" });
      expect(FooError.is(fooError)).toBe(true);
    });

    it("BarError.is(fooError) is false", () => {
      class FooError extends TaggedError("FooError")<{ message: string }>() {}
      class BarError extends TaggedError("BarError")<{ message: string }>() {}
      const fooError = new FooError({ message: "foo" });
      expect(BarError.is(fooError)).toBe(false);
    });

    it("isTaggedError(fooError) is true for any TaggedError", () => {
      class FooError extends TaggedError("FooError")<{ message: string }>() {}
      class BarError extends TaggedError("BarError")<{ message: string }>() {}
      const fooError = new FooError({ message: "foo" });
      const barError = new BarError({ message: "bar" });
      expect(isTaggedError(fooError)).toBe(true);
      expect(isTaggedError(barError)).toBe(true);
    });

    it("TaggedError.is(fooError) is true for any TaggedError", () => {
      class FooError extends TaggedError("FooError")<{ message: string }>() {}
      class BarError extends TaggedError("BarError")<{ message: string }>() {}
      const fooError = new FooError({ message: "foo" });
      const barError = new BarError({ message: "bar" });
      expect(TaggedError.is(fooError)).toBe(true);
      expect(TaggedError.is(barError)).toBe(true);
    });

    it("TaggedError.is returns false for plain Error", () => {
      expect(TaggedError.is(new Error())).toBe(false);
    });
  });

  describe("matchError", () => {
    const matchAppError = (error: AppError) =>
      matchError(error, {
        NotFoundError: (e) => `missing: ${e.id}`,
        ValidationError: (e) => `invalid: ${e.field}`,
        NetworkError: (e) => `network: ${e.url}`,
      });

    it("matches NotFoundError", () => {
      const error: AppError = new NotFoundError({ id: "123", message: "not found" });
      expect(matchAppError(error)).toBe("missing: 123");
    });

    it("matches ValidationError", () => {
      const error: AppError = new ValidationError({ field: "email", message: "invalid" });
      expect(matchAppError(error)).toBe("invalid: email");
    });

    it("matches NetworkError", () => {
      const error: AppError = new NetworkError({
        url: "https://api.example.com",
        message: "failed",
      });
      expect(matchAppError(error)).toBe("network: https://api.example.com");
    });

    it("works data-last (pipeable)", () => {
      const error: AppError = new NotFoundError({ id: "456", message: "not found" });
      const matcher = matchError<AppError, string>({
        NotFoundError: (e) => `missing: ${e.id}`,
        ValidationError: (e) => `invalid: ${e.field}`,
        NetworkError: (e) => `network: ${e.url}`,
      });
      expect(matcher(error)).toBe("missing: 456");
    });

    it("provides type narrowing in handlers", () => {
      const error = new NotFoundError({ id: "789", message: "not found" }) as AppError;
      const result = matchError(error, {
        NotFoundError: (e) => {
          // Type is narrowed: e.id exists, e.field would error
          const id: string = e.id;
          const tag: "NotFoundError" = e._tag;
          return { id, tag };
        },
        ValidationError: (e) => {
          // Type is narrowed: e.field exists
          const field: string = e.field;
          const tag: "ValidationError" = e._tag;
          return { field, tag };
        },
        NetworkError: (e) => {
          // Type is narrowed: e.url exists
          const url: string = e.url;
          const tag: "NetworkError" = e._tag;
          return { url, tag };
        },
      });
      expect(result).toEqual({ id: "789", tag: "NotFoundError" });
    });
  });

  describe("matchErrorPartial", () => {
    const matchPartialAppError = (error: AppError) =>
      matchErrorPartial(
        error,
        {
          NotFoundError: (e) => `missing: ${e.id}`,
        },
        (e) => `fallback: ${e._tag}`,
      );

    it("matches known tag", () => {
      const error: AppError = new NotFoundError({ id: "123", message: "not found" });
      expect(matchPartialAppError(error)).toBe("missing: 123");
    });

    it("falls back for unhandled tag", () => {
      const error: AppError = new NetworkError({
        url: "https://api.example.com",
        message: "failed",
      });
      expect(matchPartialAppError(error)).toBe("fallback: NetworkError");
    });

    it("narrows fallback type to exclude handled errors (data-first)", () => {
      // Wrapper function ensures E is inferred as AppError from the parameter type
      const matchTwoHandlers = (error: AppError) =>
        matchErrorPartial(
          error,
          {
            NotFoundError: (e) => `not found: ${e.id}`,
            NetworkError: (e) => `network: ${e.url}`,
          },
          (e) => {
            // Fallback only receives ValidationError since others are handled
            const _check: ValidationError = e;
            // @ts-expect-error - e should NOT have 'id' property (NotFoundError excluded)
            void e.id;
            // @ts-expect-error - e should NOT have 'url' property (NetworkError excluded)
            void e.url;
            return `validation: ${_check.field}`;
          },
        );

      const error = new ValidationError({ field: "email", message: "invalid" });
      expect(matchTwoHandlers(error)).toBe("validation: email");
    });

    it("fallback type excludes single handled error (data-first)", () => {
      // Wrapper function ensures E is inferred as AppError from the parameter type
      const matchOneHandler = (error: AppError) =>
        matchErrorPartial(
          error,
          {
            NotFoundError: (e) => `not found: ${e.id}`,
          },
          (e) => {
            // Fallback receives ValidationError | NetworkError
            type Expected = ValidationError | NetworkError;
            const _check: Expected = e;
            // @ts-expect-error - e should NOT have 'id' property (NotFoundError excluded)
            void e.id;
            return `other: ${_check._tag}`;
          },
        );

      const error = new NetworkError({ url: "https://example.com", message: "timeout" });
      expect(matchOneHandler(error)).toBe("other: NetworkError");
    });

    it("data-last form narrows fallback type", () => {
      // Data-last: only need <E, R> - H is inferred from inline handlers object
      const matcher = matchErrorPartial<AppError, string>(
        {
          NotFoundError: (e) => `not found: ${e.id}`,
          ValidationError: (e) => `validation: ${e.field}`,
        },
        (e) => {
          // Only NetworkError remains - type is properly narrowed
          const _check: NetworkError = e;
          return `network: ${_check.url}`;
        },
      );

      const error: AppError = new NetworkError({ url: "https://api.test.com", message: "failed" });
      expect(matcher(error)).toBe("network: https://api.test.com");
    });

    it("data-last form with explicit H for stored handlers", () => {
      // When handlers are stored in a variable, use `as const` or explicit H
      const handlers = {
        NotFoundError: (e: NotFoundError) => `not found: ${e.id}`,
      } as const;

      const matcher = matchErrorPartial<AppError, string, typeof handlers>(handlers, (e) => {
        // ValidationError | NetworkError remains
        type Expected = ValidationError | NetworkError;
        const _check: Expected = e;
        // @ts-expect-error - e should NOT have 'id' property (NotFoundError excluded)
        void e.id;
        return `other: ${_check._tag}`;
      });

      const error: AppError = new ValidationError({ field: "email", message: "invalid" });
      expect(matcher(error)).toBe("other: ValidationError");
    });

    it("handles all errors leaving never in fallback", () => {
      // Wrapper function ensures E is inferred as AppError from the parameter type
      const matchAllHandlers = (error: AppError) =>
        matchErrorPartial(
          error,
          {
            NotFoundError: (e) => `not found: ${e.id}`,
            ValidationError: (e) => `validation: ${e.field}`,
            NetworkError: (e) => `network: ${e.url}`,
          },
          (_e) => {
            // When all errors are handled, fallback receives never
            type FallbackType = typeof _e;
            type IsNever = [FallbackType] extends [never] ? true : false;
            const _proof: IsNever = true;
            void _proof;
            return "unreachable";
          },
        );

      const error = new NotFoundError({ id: "123", message: "missing" });
      expect(matchAllHandlers(error)).toBe("not found: 123");
    });
  });
});

describe("UnhandledException", () => {
  it("wraps Error cause", () => {
    const cause = new Error("original");
    const error = new UnhandledException({ cause });
    expect(error._tag).toBe("UnhandledException");
    expect(error.message).toBe("Unhandled exception: original");
    expect(error.cause).toBe(cause);
  });

  it("wraps non-Error cause", () => {
    const error = new UnhandledException({ cause: "string error" });
    expect(error.message).toBe("Unhandled exception: string error");
  });

  it("handles null cause", () => {
    const error = new UnhandledException({ cause: null });
    expect(error.message).toBe("Unhandled exception: null");
  });
});
