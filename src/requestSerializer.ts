/**
 * Global mutex for LSP requests over stdio.
 * Ensures only one request is in-flight at a time to prevent
 * OOM from concurrent large JSON responses on the stdio pipe.
 */
export class RequestSerializer {
    private _queue: Promise<void> = Promise.resolve();

    /** Run an async function while holding the global lock. */
    async run<T>(fn: () => Promise<T>): Promise<T> {
        let resolve!: () => void;
        const gate = new Promise<void>((r) => {
            resolve = r;
        });
        const prev = this._queue;
        this._queue = gate;
        await prev;
        try {
            return await fn();
        } finally {
            resolve();
        }
    }
}
