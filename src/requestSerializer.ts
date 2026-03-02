/**
 * Global mutex for LSP requests over stdio.
 * Ensures only one request is in-flight at a time to prevent
 * OOM from concurrent large JSON responses on the stdio pipe.
 */

/** Default timeout (ms) for lock acquisition. */
const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

export class RequestSerializer {
    private _queue: Promise<void> = Promise.resolve();

    constructor(private readonly _lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS) {}

    /** Run an async function while holding the global lock.
     *
     * If the previous holder doesn't release within `_lockTimeoutMs`,
     * the queue is drained and the function runs anyway to prevent
     * permanent deadlock.
     */
    async run<T>(fn: () => Promise<T>): Promise<T> {
        let resolve!: () => void;
        const gate = new Promise<void>((r) => {
            resolve = r;
        });
        const prev = this._queue;
        this._queue = gate;

        // Race the previous lock against a timeout to prevent permanent deadlock.
        const timeout = new Promise<void>((r) => {
            const timer = setTimeout(() => {
                console.warn(
                    `[RequestSerializer] Lock acquisition timed out after ${this._lockTimeoutMs}ms, draining queue`,
                );
                r();
            }, this._lockTimeoutMs);
            prev.then(() => {
                clearTimeout(timer);
                r();
            });
        });
        await timeout;

        try {
            return await fn();
        } finally {
            resolve();
        }
    }
}
