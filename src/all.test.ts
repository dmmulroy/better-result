import { describe, expect, it, jest } from "bun:test";
import { all } from "./all";
import { AnyResult, Result } from "./result";

// TODO: use fake timers, but Bun does not seem to have them yet
describe("all", () => {
  describe("eager", () => {
    describe("default mode", () => {
      it("returns all results in order for success cases", async () => {
        const results = await all([
          Promise.resolve(Result.ok(1 as const)),
          Promise.resolve(Result.ok(2 as const)),
          Promise.resolve(Result.ok(3 as const)),
        ]);

        expect(results).toEqual(Result.ok([1, 2, 3]));
      });

      it("short circuits on first error", async () => {
        const results = await all([
          // Would hang forever if we didn't short circuit
          new Promise<Result<never, never>>(() => {}),
          Promise.resolve(Result.err(2 as const)),
        ]);

        expect(results).toEqual(Result.err(2));
      });
    });
    describe("settled mode", () => {
      it("returns all results in order", async () => {
        const results = await all(
          [
            Promise.resolve(Result.ok(1)),
            Promise.resolve(Result.err(2)),
            Promise.resolve(Result.ok(3)),
          ],
          {
            mode: "settled",
          }
        );
        expect(results).toEqual([Result.ok(1), Result.err(2), Result.ok(3)]);
      });
    });
  });

  describe("lazy", () => {
    describe("default mode", () => {
      it("returns result in order and adheres to concurrency", async () => {
        const mock = jest.fn();
        const makeFn = (i: number) => {
          const resolvers = Promise.withResolvers<void>();
          const fn = async () => {
            mock();
            await resolvers.promise;
            return Result.ok(i);
          };
          return { fn, resolve: resolvers.resolve };
        };

        const [one, two, three, four] = [
          makeFn(1),
          makeFn(2),
          makeFn(3),
          makeFn(4),
        ];

        const promise = all([one.fn, two.fn, three.fn, four.fn], {
          concurrency: 2,
        });

        expect(mock).toHaveBeenCalledTimes(2);
        one.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        expect(mock).toHaveBeenCalledTimes(3);
        two.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        expect(mock).toHaveBeenCalledTimes(4);
        three.resolve();
        four.resolve();

        const results = await promise;
        expect(results).toEqual(Result.ok([1, 2, 3, 4]));
      });
      it("short circuits on first error", async () => {
        const mock = jest.fn();
        const makeFn = (i: number) => {
          const resolvers = Promise.withResolvers<void>();
          const fn = async () => {
            mock();
            await resolvers.promise;
            return Result.ok(i);
          };
          return { fn, resolve: resolvers.resolve };
        };

        const [one, two] = [makeFn(1), makeFn(2)];

        const promise = all(
          [one.fn, two.fn, () => Promise.resolve(Result.err(3 as const))],
          {
            concurrency: 2,
          }
        );

        expect(mock).toHaveBeenCalledTimes(2);
        one.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        // We never resolve second promise, if we don't short circuit on third (error case) this would hang forever
        const res = await promise;
        expect(res).toEqual(Result.err(3));
      });
    });
    describe("settled mode", () => {
      it("returns results in order and adheres to concurrency", async () => {
        const mock = jest.fn();
        const makeFn = (result: AnyResult) => {
          const resolvers = Promise.withResolvers<void>();
          const fn = async () => {
            mock();
            await resolvers.promise;
            return result;
          };
          return { fn, resolve: resolvers.resolve };
        };

        const [one, two, three, four] = [
          makeFn(Result.ok(1)),
          makeFn(Result.err(2)),
          makeFn(Result.ok(3)),
          makeFn(Result.ok(4)),
        ];

        const promise = all([one.fn, two.fn, three.fn, four.fn], {
          concurrency: 2,
          mode: "settled",
        });

        expect(mock).toHaveBeenCalledTimes(2);
        one.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        expect(mock).toHaveBeenCalledTimes(3);
        two.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        expect(mock).toHaveBeenCalledTimes(4);
        three.resolve();
        four.resolve();

        const results = await promise;

        expect(results).toEqual([
          Result.ok(1),
          Result.err(2),
          Result.ok(3),
          Result.ok(4),
        ]);
      });
    });
  });
});
