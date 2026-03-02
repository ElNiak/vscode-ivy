import * as assert from "assert";
import { RequestSerializer } from "../../requestSerializer";

describe("RequestSerializer", () => {
    it("runs a single function and returns its result", async () => {
        const s = new RequestSerializer();
        const result = await s.run(async () => 42);
        assert.strictEqual(result, 42);
    });

    it("serializes concurrent calls", async () => {
        const s = new RequestSerializer();
        const log: string[] = [];
        const a = s.run(async () => {
            log.push("a-start");
            await new Promise<void>((r) => setTimeout(r, 50));
            log.push("a-end");
            return "a";
        });
        const b = s.run(async () => {
            log.push("b-start");
            await new Promise<void>((r) => setTimeout(r, 10));
            log.push("b-end");
            return "b";
        });
        const [ra, rb] = await Promise.all([a, b]);
        assert.strictEqual(ra, "a");
        assert.strictEqual(rb, "b");
        assert.deepStrictEqual(log, ["a-start", "a-end", "b-start", "b-end"]);
    });

    it("releases lock when fn throws", async () => {
        const s = new RequestSerializer();
        await assert.rejects(
            () =>
                s.run(async () => {
                    throw new Error("boom");
                }),
            { message: "boom" }
        );
        const result = await s.run(async () => "ok");
        assert.strictEqual(result, "ok");
    });

    it("proceeds after lock timeout", async () => {
        const s = new RequestSerializer(100);
        const log: string[] = [];
        // First function holds lock forever
        const hung = s.run(async () => {
            log.push("hung");
            await new Promise<void>(() => {});
        });
        // Second should proceed after 100ms timeout
        const result = await s.run(async () => {
            log.push("second");
            return "done";
        });
        assert.strictEqual(result, "done");
        assert.ok(log.includes("second"));
    });
});
