import * as assert from "assert";

const ErrorAction = { Continue: 1, Shutdown: 2 } as const;
const CloseAction = { Restart: 1, DoNotRestart: 2 } as const;

class ConfigurableErrorHandler {
    private restarts: number[] = [];
    constructor(
        private maxRestartCount: number,
        private restartWindowMs: number
    ) {}

    error(count: number | undefined): number {
        if (count && count <= 3) return ErrorAction.Continue;
        return ErrorAction.Shutdown;
    }

    closed(now: number): { action: number; message?: string } {
        if (this.maxRestartCount === -1) {
            return { action: CloseAction.Restart };
        }
        this.restarts.push(now);
        while (this.restarts.length > this.maxRestartCount + 1) {
            this.restarts.shift();
        }
        if (this.restarts.length <= this.maxRestartCount) {
            return { action: CloseAction.Restart };
        }
        const diff =
            this.restarts[this.restarts.length - 1] - this.restarts[0];
        if (diff <= this.restartWindowMs) {
            return {
                action: CloseAction.DoNotRestart,
                message: "Too many crashes",
            };
        }
        this.restarts.shift();
        return { action: CloseAction.Restart };
    }
}

describe("ConfigurableErrorHandler", () => {
    it("continues for count <= 3", () => {
        const h = new ConfigurableErrorHandler(5, 60000);
        assert.strictEqual(h.error(1), ErrorAction.Continue);
        assert.strictEqual(h.error(3), ErrorAction.Continue);
    });

    it("shuts down for count > 3", () =>
        assert.strictEqual(
            new ConfigurableErrorHandler(5, 60000).error(4),
            ErrorAction.Shutdown
        ));

    it("shuts down for undefined count", () =>
        assert.strictEqual(
            new ConfigurableErrorHandler(5, 60000).error(undefined),
            ErrorAction.Shutdown
        ));

    it("always restarts when maxRestartCount is -1", () => {
        const h = new ConfigurableErrorHandler(-1, 60000);
        for (let i = 0; i < 10; i++)
            assert.strictEqual(
                h.closed(i * 1000).action,
                CloseAction.Restart
            );
    });

    it("stops after too many crashes in window", () => {
        const h = new ConfigurableErrorHandler(3, 60000);
        assert.strictEqual(h.closed(0).action, CloseAction.Restart);
        assert.strictEqual(h.closed(1000).action, CloseAction.Restart);
        assert.strictEqual(h.closed(2000).action, CloseAction.Restart);
        assert.strictEqual(h.closed(3000).action, CloseAction.DoNotRestart);
    });

    it("restarts when crashes spread beyond window", () => {
        const h = new ConfigurableErrorHandler(3, 10000);
        h.closed(0);
        h.closed(1000);
        h.closed(2000);
        assert.strictEqual(h.closed(20000).action, CloseAction.Restart);
    });
});
