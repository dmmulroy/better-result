import { describe, expect, it } from "bun:test";
import { all } from "./all";
import { Result } from "./result";

describe("all", () => {
  describe("eager", () => {
    describe("default mode", () => {
      it("returns all results in order for success cases", async () => {
        const results = await all([
          Promise.resolve(Result.ok(1 as const)),
          Promise.resolve(Result.ok(2 as const)),
          Promise.resolve(Result.ok(3 as const)),
        ]);

        expect(results.status).toBe("ok");
        expect(results.unwrap()).toEqual([1, 2, 3]);
      });

      it("short circuits on first error", async () => {
        const results = await all([
          // Would hang forever if we didn't short circuit
          new Promise<Result<never, never>>(() => {}),
          Promise.resolve(Result.err(2 as const)),
        ]);

        expect(results.status).toBe("error");
        if (Result.isOk(results)) {
          expect.unreachable("should be error");
        }
        expect(results.error).toBe(2);
      });
    });
    describe("settled mode", () => {
      it("returns all results in order", async () => {
        const [one, two, three] = await all(
          [
            Promise.resolve(Result.ok(1)),
            Promise.resolve(Result.err(2)),
            Promise.resolve(Result.ok(3)),
          ],
          {
            mode: "settled",
          }
        );

        expect(one.isOk()).toBe(true);
        expect(one.unwrap()).toBe(1);
        expect(two.isErr()).toBe(true);
        expect(two.error).toBe(2);
        expect(three.isOk()).toBe(true);
        expect(three.unwrap()).toBe(3);
      });
    });
  });
});
