/** Polling orchestrator for ivy-lsp monitoring endpoints. */

import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import {
    ServerStatus,
    IndexerStats,
    OperationHistory,
    ActionResult,
    FeatureStatus,
    DeepIndexProgress,
    TestFeatureMatrix,
    AnalysisPipelineDetail,
    CompilationProgressNotification,
} from "./monitorTypes";
import { RequestSerializer } from "./requestSerializer";

/** Timeout (ms) for individual poll requests once the server is ready. */
const POLL_TIMEOUT_BASE_MS = 5000;
/** Longer timeout (ms) used while the server is still initializing. */
const POLL_TIMEOUT_INIT_MS = 30000;

/** Client-side state tracker that polls the LSP server for monitoring data. */
export class LspStateTracker implements vscode.Disposable {
    private _statusTimer: ReturnType<typeof setInterval> | null = null;
    private _statsTimer: ReturnType<typeof setInterval> | null = null;
    private _historyTimer: ReturnType<typeof setInterval> | null = null;
    private _featureTimer: ReturnType<typeof setInterval> | null = null;
    private _progressTimer: ReturnType<typeof setInterval> | null = null;
    private _pipelineTimer: ReturnType<typeof setInterval> | null = null;
    /** Pending stagger timeouts that create interval timers at startup. */
    private _staggerTimers: ReturnType<typeof setTimeout>[] = [];
    /** True once _startDeferredTimers() has been called (prevents duplicates). */
    private _deferredTimersStarted = false;
    /** True until the server sends ``ivy/serverReady`` or status.initializing becomes false. */
    private _serverInitializing = true;
    private _visible = false;

    /** Cached state from most recent poll. */
    public serverStatus: ServerStatus | null = null;
    public indexerStats: IndexerStats | null = null;
    public operationHistory: OperationHistory | null = null;
    public featureStatus: FeatureStatus | null = null;
    public deepIndexProgress: DeepIndexProgress | null = null;
    public testFeatureMatrix: TestFeatureMatrix | null = null;
    public pipelineDetail: AnalysisPipelineDetail | null = null;

    /** State-change detection for toast notifications. */
    private _prevIndexingState: string | null = null;
    private _prevStaleCount = 0;
    private _prevDeepIndexRunning = false;
    private _prevTier3FileCount = 0;

    /** Per-endpoint exponential backoff to isolate failures. */
    private _backoffs: Record<string, { backoff: number; skipCount: number }> = {};

    /** Fires when any cached state changes. */
    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    constructor(
        private client: LanguageClient | null,
        private _serializer?: RequestSerializer,
    ) {}

    /** Update the underlying client (e.g. after restart). Resets cached state. */
    setClient(newClient: LanguageClient | null): void {
        this._stopPolling();
        this.client = newClient;
        this.serverStatus = null;
        this.indexerStats = null;
        this.operationHistory = null;
        this.featureStatus = null;
        this.deepIndexProgress = null;
        this.testFeatureMatrix = null;
        this.pipelineDetail = null;
        this._prevIndexingState = null;
        this._prevStaleCount = 0;
        this._prevDeepIndexRunning = false;
        this._prevTier3FileCount = 0;
        this._backoffs = {};
        this._deferredTimersStarted = false;
        this._serverInitializing = true;
        this._onDidChange.fire();
        if (this._visible && newClient) {
            this._startPolling();
        }
    }

    get isPolling(): boolean {
        return this._statusTimer !== null;
    }

    /** Start or stop polling based on panel visibility. */
    setVisible(visible: boolean): void {
        this._visible = visible;
        if (visible) {
            this._startPolling();
        } else {
            this._stopPolling();
        }
    }

    /** Called when the server has completed initialization.
     *
     * Transitions from init-only polling to full monitoring.
     */
    onServerReady(): void {
        if (!this._serverInitializing) {
            return;
        }
        this._serverInitializing = false;
        if (this._visible) {
            this._startDeferredTimers();
            this.refreshNow();
        }
    }

    /** Handle a push notification from the server with real-time compilation progress.
     *
     * Updates the cached ``pipelineDetail.compilation`` in-place so the
     * monitoring tree/dashboard reflects T3 progress immediately instead
     * of waiting for the next 3 s polling cycle.
     */
    handleCompilationProgress(params: CompilationProgressNotification): void {
        if (this.pipelineDetail) {
            this.pipelineDetail.compilation.completed = params.completed;
            this.pipelineDetail.compilation.total = params.total;
            // Heuristic: derive running from progress counts. The next 3 s poll
            // cycle will reconcile with the server-authoritative value.
            this.pipelineDetail.compilation.running = params.completed < params.total;
            if (params.currentFile !== null) {
                this.pipelineDetail.tier3.currentFile = params.currentFile;
            }
            this._onDidChange.fire();
        } else {
            console.debug("[ivy-tracker] compilationProgress dropped: pipelineDetail not yet available");
        }
    }

    /** Force an immediate refresh of all cached state.
     *
     * Requests are sent sequentially with short gaps to avoid flooding
     * the LSP stdio pipe at startup (which can trigger OOM crashes in
     * Node.js when many large responses arrive simultaneously).
     */
    async refreshNow(): Promise<void> {
        if (!this.client || this.client.state !== 2 /* Running */) {
            return;
        }
        // During initialization, only poll server status (lightweight, in-memory)
        if (this._serverInitializing) {
            await this._pollStatus();
            return;
        }
        const doRefresh = async (): Promise<void> => {
            // Capture client reference so it cannot become null mid-refresh
            // if setClient(null) is called while awaiting a response.
            const c = this.client;
            if (!c || c.state !== 2) { return; }

            const delay = (ms: number) =>
                new Promise<void>((r) => setTimeout(r, ms));

            try {
                const status = await c.sendRequest<ServerStatus>(
                    "ivy/serverStatus",
                    null
                );
                this.serverStatus = status;
            } catch (err) {
                console.debug("[ivy-tracker] refreshNow ivy/serverStatus failed:", err);
                this.serverStatus = null;
            }
            await delay(250);

            try {
                const stats = await c.sendRequest<IndexerStats>(
                    "ivy/indexerStats",
                    null
                );
                this.indexerStats = stats;
            } catch (err) {
                console.debug("[ivy-tracker] refreshNow ivy/indexerStats failed:", err);
                this.indexerStats = null;
            }
            await delay(250);

            try {
                const history = await c.sendRequest<OperationHistory>(
                    "ivy/operationHistory",
                    null
                );
                this.operationHistory = history;
            } catch (err) {
                console.debug("[ivy-tracker] refreshNow ivy/operationHistory failed:", err);
                this.operationHistory = null;
            }
            await delay(250);

            try {
                const features = await c.sendRequest<FeatureStatus>(
                    "ivy/featureStatus",
                    null
                );
                this.featureStatus = features;
            } catch (err) {
                console.debug("[ivy-tracker] refreshNow ivy/featureStatus failed:", err);
                this.featureStatus = null;
            }
            await delay(250);

            try {
                const deepIndex =
                    await c.sendRequest<DeepIndexProgress>(
                        "ivy/deepIndexProgress",
                        null
                    );
                this.deepIndexProgress = deepIndex;
            } catch (err) {
                console.debug("[ivy-tracker] refreshNow ivy/deepIndexProgress failed:", err);
                this.deepIndexProgress = null;
            }
            await delay(250);

            try {
                const testMatrix =
                    await c.sendRequest<TestFeatureMatrix>(
                        "ivy/testFeatureMatrix",
                        null
                    );
                this.testFeatureMatrix = testMatrix;
            } catch (err) {
                console.debug("[ivy-tracker] refreshNow ivy/testFeatureMatrix failed:", err);
                this.testFeatureMatrix = null;
            }
            await delay(250);

            try {
                const pipelineDetail =
                    await c.sendRequest<AnalysisPipelineDetail>(
                        "ivy/analysisPipelineDetail",
                        null
                    );
                this.pipelineDetail = pipelineDetail;
            } catch (err) {
                console.debug("[ivy-tracker] refreshNow ivy/analysisPipelineDetail failed:", err);
                this.pipelineDetail = null;
            }

            this._checkForStateChanges();
            this._checkForDeepIndexChanges();
            this._checkForTier3Changes();
            this._onDidChange.fire();
        };

        if (this._serializer) {
            await this._serializer.run(doRefresh);
        } else {
            await doRefresh();
        }
    }

    async sendReindex(): Promise<ActionResult | null> {
        if (!this.client) {
            return { success: false, message: "LSP server is not connected" };
        }
        return this.client.sendRequest<ActionResult>("ivy/reindex", null);
    }

    async sendClearCache(): Promise<ActionResult | null> {
        if (!this.client) {
            return { success: false, message: "LSP server is not connected" };
        }
        return this.client.sendRequest<ActionResult>("ivy/clearCache", null);
    }

    private _startPolling(): void {
        if (this._statusTimer) {
            return;
        }
        // Always start the lightweight status poll immediately.
        this._pollStatus();
        this._statusTimer = setInterval(() => this._pollStatus(), 3000);
        // Defer heavyweight timers until the server is ready.
        if (!this._serverInitializing) {
            this._startDeferredTimers();
        }
    }

    /** Start the staggered heavyweight polling timers.
     *
     * Called either from ``_startPolling`` (server already ready) or from
     * ``onServerReady`` (server just finished initialization).
     */
    private _startDeferredTimers(): void {
        if (this._deferredTimersStarted) { return; }
        this._deferredTimersStarted = true;
        this._staggerTimers.push(setTimeout(() => {
            this._statsTimer = setInterval(() => this._pollStats(), 10000);
        }, 500));
        this._staggerTimers.push(setTimeout(() => {
            this._historyTimer = setInterval(
                () => this._pollHistory(),
                5000
            );
        }, 1000));
        this._staggerTimers.push(setTimeout(() => {
            this._featureTimer = setInterval(
                () => this._pollFeatures(),
                5000
            );
        }, 1500));
        this._staggerTimers.push(setTimeout(() => {
            this._progressTimer = setInterval(
                () => this._pollProgress(),
                2000
            );
        }, 2000));
        this._staggerTimers.push(setTimeout(() => {
            this._pipelineTimer = setInterval(
                () => this._pollPipelineDetail(),
                3000
            );
        }, 2500));
    }

    private _stopPolling(): void {
        // Cancel pending stagger timeouts before they create new intervals.
        for (const t of this._staggerTimers) {
            clearTimeout(t);
        }
        this._staggerTimers = [];
        this._deferredTimersStarted = false;
        if (this._statusTimer) {
            clearInterval(this._statusTimer);
        }
        if (this._statsTimer) {
            clearInterval(this._statsTimer);
        }
        if (this._historyTimer) {
            clearInterval(this._historyTimer);
        }
        if (this._featureTimer) {
            clearInterval(this._featureTimer);
        }
        if (this._progressTimer) {
            clearInterval(this._progressTimer);
        }
        if (this._pipelineTimer) {
            clearInterval(this._pipelineTimer);
        }
        this._statusTimer = null;
        this._statsTimer = null;
        this._historyTimer = null;
        this._featureTimer = null;
        this._progressTimer = null;
        this._pipelineTimer = null;
    }

    /** Send a request with a timeout to prevent indefinite hangs.
     *
     * Uses a longer timeout while the server is initializing (z3 import,
     * workspace scan) so that requests aren't prematurely cancelled.
     */
    private _sendWithTimeout<T>(method: string): Promise<T> {
        const timeout = this._serverInitializing
            ? POLL_TIMEOUT_INIT_MS
            : POLL_TIMEOUT_BASE_MS;
        return new Promise<T>((resolve, reject) => {
            if (!this.client) {
                reject(new Error(`${method}: client is null`));
                return;
            }
            const timer = setTimeout(
                () => reject(new Error(`${method} timed out`)),
                timeout,
            );
            this.client.sendRequest<T>(method, null).then(
                (result) => { clearTimeout(timer); resolve(result); },
                (err) => { clearTimeout(timer); reject(err); },
            );
        });
    }

    private _getBackoff(endpoint: string): { backoff: number; skipCount: number } {
        if (!this._backoffs[endpoint]) {
            this._backoffs[endpoint] = { backoff: 0, skipCount: 0 };
        }
        return this._backoffs[endpoint];
    }

    /** Record a successful poll (resets backoff for this endpoint). */
    private _onPollSuccess(endpoint: string): void {
        const state = this._getBackoff(endpoint);
        state.backoff = 0;
        state.skipCount = 0;
    }

    /** Record a failed poll (increases backoff for this endpoint). */
    private _onPollFailure(endpoint: string): void {
        const state = this._getBackoff(endpoint);
        state.backoff = Math.min(state.backoff + 1, 5);
        state.skipCount = state.backoff;
    }

    /** Returns true if this poll cycle should be skipped due to backoff. */
    private _shouldSkip(endpoint: string): boolean {
        const state = this._getBackoff(endpoint);
        if (state.skipCount > 0) {
            state.skipCount--;
            return true;
        }
        return false;
    }

    private async _pollStatus(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip("status")) {
            return;
        }
        const doPoll = async (): Promise<void> => {
            try {
                this.serverStatus = await this._sendWithTimeout<ServerStatus>(
                    "ivy/serverStatus"
                );
                this._onPollSuccess("status");
                // Fallback: detect init->ready transition from status response
                // in case the ivy/serverReady notification was missed.
                if (
                    this._serverInitializing &&
                    this.serverStatus &&
                    !this.serverStatus.initializing
                ) {
                    this.onServerReady();
                }
                this._checkForStateChanges();
                this._onDidChange.fire();
            } catch (err) {
                console.debug("[ivy-tracker] status poll failed:", err);
                this._onPollFailure("status");
            }
        };
        if (this._serializer) {
            await this._serializer.run(doPoll);
        } else {
            await doPoll();
        }
    }

    private async _pollStats(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip("stats")) {
            return;
        }
        const doPoll = async (): Promise<void> => {
            try {
                this.indexerStats = await this._sendWithTimeout<IndexerStats>(
                    "ivy/indexerStats"
                );
                this._onPollSuccess("stats");
                this._onDidChange.fire();
            } catch (err) {
                console.debug("[ivy-tracker] stats poll failed:", err);
                this._onPollFailure("stats");
            }
        };
        if (this._serializer) {
            await this._serializer.run(doPoll);
        } else {
            await doPoll();
        }
    }

    private async _pollHistory(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip("history")) {
            return;
        }
        const doPoll = async (): Promise<void> => {
            try {
                this.operationHistory =
                    await this._sendWithTimeout<OperationHistory>(
                        "ivy/operationHistory"
                    );
                this._onPollSuccess("history");
                this._onDidChange.fire();
            } catch (err) {
                console.debug("[ivy-tracker] history poll failed:", err);
                this._onPollFailure("history");
            }
        };
        if (this._serializer) {
            await this._serializer.run(doPoll);
        } else {
            await doPoll();
        }
    }

    private async _pollFeatures(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip("features")) {
            return;
        }
        const doPoll = async (): Promise<void> => {
            try {
                this.featureStatus = await this._sendWithTimeout<FeatureStatus>(
                    "ivy/featureStatus"
                );
                this._onPollSuccess("features");
                this._onDidChange.fire();
            } catch (err) {
                console.debug("[ivy-tracker] features poll failed:", err);
                this._onPollFailure("features");
            }
        };
        if (this._serializer) {
            await this._serializer.run(doPoll);
        } else {
            await doPoll();
        }
    }

    private _checkForStateChanges(): void {
        if (!this.serverStatus) {
            return;
        }

        const newState = this.serverStatus.indexingState;

        // Indexing completed notification
        if (this._prevIndexingState === "indexing" && newState === "idle") {
            const stats = this.indexerStats;
            const msg = stats
                ? `Ivy: Indexed ${stats.fileCount} files (${stats.symbolCount} symbols)`
                : "Ivy: Indexing complete";
            vscode.window.showInformationMessage(msg);
        }

        // Indexing error notification
        if (newState === "error" && this._prevIndexingState !== "error") {
            const err = this.serverStatus.indexingError || "Unknown error";
            vscode.window
                .showErrorMessage(
                    `Ivy: Indexing failed: ${err}`,
                    "Show Output"
                )
                .then((action) => {
                    if (action === "Show Output") {
                        vscode.commands.executeCommand("ivy.showOutput");
                    }
                });
        }

        // Stale file detection
        const staleCount = this.indexerStats?.staleFiles?.length ?? 0;
        if (staleCount > this._prevStaleCount) {
            vscode.window
                .showWarningMessage(
                    `Ivy: ${staleCount} stale file(s) detected`,
                    "Re-index"
                )
                .then((action) => {
                    if (action === "Re-index") {
                        this.sendReindex().catch((e) => {
                            console.warn("[ivy-tracker] reindex failed:", e);
                            vscode.window.showErrorMessage(
                                `Ivy: Re-index failed \u2014 ${e instanceof Error ? e.message : String(e)}`
                            );
                        });
                    }
                });
        }

        this._prevStaleCount = staleCount;
        this._prevIndexingState = newState;
    }

    private async _pollProgress(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        const doPoll = async (): Promise<void> => {
            let changed = false;
            // Poll each endpoint independently so one failure doesn't
            // suppress the other via shared backoff.
            if (!this._shouldSkip("deepIndex")) {
                try {
                    this.deepIndexProgress =
                        await this._sendWithTimeout<DeepIndexProgress>(
                            "ivy/deepIndexProgress"
                        );
                    this._onPollSuccess("deepIndex");
                    this._checkForDeepIndexChanges();
                    changed = true;
                } catch (err) {
                    console.debug("[ivy-tracker] deepIndex poll failed:", err);
                    this._onPollFailure("deepIndex");
                }
            }
            if (!this._shouldSkip("testMatrix")) {
                try {
                    this.testFeatureMatrix =
                        await this._sendWithTimeout<TestFeatureMatrix>(
                            "ivy/testFeatureMatrix"
                        );
                    this._onPollSuccess("testMatrix");
                    changed = true;
                } catch (err) {
                    console.debug("[ivy-tracker] testMatrix poll failed:", err);
                    this._onPollFailure("testMatrix");
                }
            }
            if (changed) {
                this._onDidChange.fire();
            }
        };
        if (this._serializer) {
            await this._serializer.run(doPoll);
        } else {
            await doPoll();
        }
    }

    private _checkForDeepIndexChanges(): void {
        if (!this.deepIndexProgress) {
            return;
        }
        const running = this.deepIndexProgress.running;
        if (this._prevDeepIndexRunning && !running) {
            const { completedTests, totalTests } = this.deepIndexProgress;
            vscode.window.showInformationMessage(
                `Ivy: Deep indexing complete (${completedTests}/${totalTests} test files)`
            );
        }
        this._prevDeepIndexRunning = running;
    }

    private async _pollPipelineDetail(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip("pipeline")) {
            return;
        }
        const doPoll = async (): Promise<void> => {
            try {
                this.pipelineDetail =
                    await this._sendWithTimeout<AnalysisPipelineDetail>(
                        "ivy/analysisPipelineDetail"
                    );
                this._onPollSuccess("pipeline");
                this._checkForTier3Changes();
                this._onDidChange.fire();
            } catch (err) {
                console.debug("[ivy-tracker] pipeline poll failed:", err);
                this._onPollFailure("pipeline");
            }
        };
        if (this._serializer) {
            await this._serializer.run(doPoll);
        } else {
            await doPoll();
        }
    }

    private _checkForTier3Changes(): void {
        if (!this.pipelineDetail) {
            return;
        }
        const currentCount = this.pipelineDetail.tier3.fileCount;
        if (currentCount > this._prevTier3FileCount && this._prevTier3FileCount > 0) {
            const { succeeded, failed } = this.pipelineDetail.tier3;
            const msg = failed > 0
                ? `Ivy: T3 analysis complete (${succeeded} passed, ${failed} failed)`
                : `Ivy: T3 analysis complete (${succeeded} passed)`;
            vscode.window.showInformationMessage(msg);
        }
        this._prevTier3FileCount = currentCount;
    }

    dispose(): void {
        this._stopPolling();
        this._onDidChange.dispose();
    }
}
