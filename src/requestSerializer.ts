/**
 * Category-aware mutex for LSP requests over stdio.
 * Requests in different categories (e.g. "poll" vs "command") run
 * independently, preventing monitoring polls from blocking user actions.
 * Requests within the same category are still serialized to prevent
 * OOM from concurrent large JSON responses on the stdio pipe.
 */

/** Default timeout (ms) for lock acquisition. */
const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

/** Request categories.  "poll" for background monitoring, "command" for user actions. */
export type RequestCategory = "poll" | "command";

export class RequestSerializer {
    private _queues: Record<RequestCategory, Promise<void>> = {
        poll: Promise.resolve(),
        command: Promise.resolve(),
    };

    constructor(private readonly _lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS) {}

    /** Run an async function while holding the category-specific lock.
     *
     * If the previous holder doesn't release within `_lockTimeoutMs`,
     * the queue is drained and the function runs anyway to prevent
     * permanent deadlock.
     *
     * @param fn The async function to execute.
     * @param category Request category – defaults to "command".
     */
    async run<T>(fn: () => Promise<T>, category: RequestCategory = "command"): Promise<T> {
        let resolve!: () => void;
        const gate = new Promise<void>((r) => {
            resolve = r;
        });
        const prev = this._queues[category];
        this._queues[category] = gate;

        // Race the previous lock against a timeout to prevent permanent deadlock.
        const timeout = new Promise<void>((r) => {
            const timer = setTimeout(() => {
                console.warn(
                    `[RequestSerializer] Lock acquisition timed out after ${this._lockTimeoutMs}ms (${category}), draining queue`,
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
