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

    it("rejects after lock timeout instead of running concurrently", async () => {
        const s = new RequestSerializer(100);
        // First function holds lock forever
        const hung = s.run(async () => {
            await new Promise<void>(() => {});
        });
        // Second should reject after 100ms timeout
        await assert.rejects(
            () => s.run(async () => "done"),
            (err: Error) => {
                assert.ok(err.message.includes("timed out"));
                return true;
            },
        );
    });

    it("recovers queue after timeout rejection", async () => {
        const s = new RequestSerializer(50);
        // Hang the first call
        const hung = s.run(async () => {
            await new Promise<void>(() => {});
        });
        // Second times out
        await assert.rejects(() => s.run(async () => "x"));
        // Third should succeed because queue was reset on timeout
        const result = await s.run(async () => "y");
        assert.strictEqual(result, "y");
    });

    it("does not block across categories", async () => {
        const s = new RequestSerializer();
        const log: string[] = [];
        const poll = s.run(async () => {
            log.push("poll-start");
            await new Promise<void>((r) => setTimeout(r, 80));
            log.push("poll-end");
        }, "poll");
        const cmd = s.run(async () => {
            log.push("cmd-start");
            log.push("cmd-end");
        }, "command");
        await Promise.all([poll, cmd]);
        // cmd should complete before poll because they're independent categories
        assert.ok(log.indexOf("cmd-end") < log.indexOf("poll-end"));
    });
});
