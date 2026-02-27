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
} from "./monitorTypes";

/** Timeout (ms) for individual poll requests. */
const POLL_TIMEOUT_MS = 5000;

/** Client-side state tracker that polls the LSP server for monitoring data. */
export class LspStateTracker implements vscode.Disposable {
    private _statusTimer: ReturnType<typeof setInterval> | null = null;
    private _statsTimer: ReturnType<typeof setInterval> | null = null;
    private _historyTimer: ReturnType<typeof setInterval> | null = null;
    private _featureTimer: ReturnType<typeof setInterval> | null = null;
    private _progressTimer: ReturnType<typeof setInterval> | null = null;
    private _visible = false;

    /** Cached state from most recent poll. */
    public serverStatus: ServerStatus | null = null;
    public indexerStats: IndexerStats | null = null;
    public operationHistory: OperationHistory | null = null;
    public featureStatus: FeatureStatus | null = null;
    public deepIndexProgress: DeepIndexProgress | null = null;
    public testFeatureMatrix: TestFeatureMatrix | null = null;

    /** State-change detection for toast notifications. */
    private _prevIndexingState: string | null = null;
    private _prevStaleCount = 0;
    private _prevDeepIndexRunning = false;

    /** Exponential backoff: number of consecutive failures (0 = healthy). */
    private _backoff = 0;
    /** Skip counter: decremented each poll cycle; polls are skipped while > 0. */
    private _skipCount = 0;

    /** Fires when any cached state changes. */
    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    constructor(private client: LanguageClient | null) {}

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
        this._prevIndexingState = null;
        this._prevStaleCount = 0;
        this._prevDeepIndexRunning = false;
        this._backoff = 0;
        this._skipCount = 0;
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

    /** Force an immediate refresh of all cached state. */
    async refreshNow(): Promise<void> {
        if (!this.client || this.client.state !== 2 /* Running */) {
            return;
        }
        try {
            const [status, stats, history, features] = await Promise.all([
                this.client.sendRequest<ServerStatus>("ivy/serverStatus", null),
                this.client.sendRequest<IndexerStats>("ivy/indexerStats", null),
                this.client.sendRequest<OperationHistory>(
                    "ivy/operationHistory",
                    null
                ),
                this.client.sendRequest<FeatureStatus>(
                    "ivy/featureStatus",
                    null
                ),
            ]);
            this.serverStatus = status;
            this.indexerStats = stats;
            this.operationHistory = history;
            this.featureStatus = features;
            this._checkForStateChanges();
            this._onDidChange.fire();
        } catch {
            this.serverStatus = null;
            this.featureStatus = null;
            this._onDidChange.fire();
        }
    }

    async sendReindex(): Promise<ActionResult | null> {
        if (!this.client) {
            return null;
        }
        return this.client.sendRequest<ActionResult>("ivy/reindex", null);
    }

    async sendClearCache(): Promise<ActionResult | null> {
        if (!this.client) {
            return null;
        }
        return this.client.sendRequest<ActionResult>("ivy/clearCache", null);
    }

    private _startPolling(): void {
        if (this._statusTimer) {
            return;
        }
        this.refreshNow();
        this._statusTimer = setInterval(() => this._pollStatus(), 3000);
        this._statsTimer = setInterval(() => this._pollStats(), 10000);
        this._historyTimer = setInterval(() => this._pollHistory(), 5000);
        this._featureTimer = setInterval(() => this._pollFeatures(), 5000);
        this._progressTimer = setInterval(() => this._pollProgress(), 2000);
    }

    private _stopPolling(): void {
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
        this._statusTimer = null;
        this._statsTimer = null;
        this._historyTimer = null;
        this._featureTimer = null;
        this._progressTimer = null;
    }

    /** Send a request with a timeout to prevent indefinite hangs. */
    private _sendWithTimeout<T>(method: string): Promise<T> {
        return Promise.race([
            this.client!.sendRequest<T>(method, null),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`${method} timed out`)),
                    POLL_TIMEOUT_MS
                )
            ),
        ]);
    }

    /** Record a successful poll (resets backoff). */
    private _onPollSuccess(): void {
        this._backoff = 0;
        this._skipCount = 0;
    }

    /** Record a failed poll (increases backoff). */
    private _onPollFailure(): void {
        this._backoff = Math.min(this._backoff + 1, 5);
        this._skipCount = this._backoff;
    }

    /** Returns true if this poll cycle should be skipped due to backoff. */
    private _shouldSkip(): boolean {
        if (this._skipCount > 0) {
            this._skipCount--;
            return true;
        }
        return false;
    }

    private async _pollStatus(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip()) {
            return;
        }
        try {
            this.serverStatus = await this._sendWithTimeout<ServerStatus>(
                "ivy/serverStatus"
            );
            this._onPollSuccess();
            this._checkForStateChanges();
            this._onDidChange.fire();
        } catch {
            this._onPollFailure();
        }
    }

    private async _pollStats(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip()) {
            return;
        }
        try {
            this.indexerStats = await this._sendWithTimeout<IndexerStats>(
                "ivy/indexerStats"
            );
            this._onPollSuccess();
            this._onDidChange.fire();
        } catch {
            this._onPollFailure();
        }
    }

    private async _pollHistory(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip()) {
            return;
        }
        try {
            this.operationHistory =
                await this._sendWithTimeout<OperationHistory>(
                    "ivy/operationHistory"
                );
            this._onPollSuccess();
            this._onDidChange.fire();
        } catch {
            this._onPollFailure();
        }
    }

    private async _pollFeatures(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        if (this._shouldSkip()) {
            return;
        }
        try {
            this.featureStatus = await this._sendWithTimeout<FeatureStatus>(
                "ivy/featureStatus"
            );
            this._onPollSuccess();
            this._onDidChange.fire();
        } catch {
            this._onPollFailure();
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
        if (staleCount > 0 && staleCount !== this._prevStaleCount) {
            vscode.window
                .showWarningMessage(
                    `Ivy: ${staleCount} stale file(s) detected`,
                    "Re-index"
                )
                .then((action) => {
                    if (action === "Re-index") {
                        this.sendReindex();
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
        if (this._shouldSkip()) {
            return;
        }
        try {
            const [progress, matrix] = await Promise.all([
                this._sendWithTimeout<DeepIndexProgress>(
                    "ivy/deepIndexProgress"
                ),
                this._sendWithTimeout<TestFeatureMatrix>(
                    "ivy/testFeatureMatrix"
                ),
            ]);
            this.deepIndexProgress = progress;
            this.testFeatureMatrix = matrix;
            this._onPollSuccess();
            this._checkForDeepIndexChanges();
            this._onDidChange.fire();
        } catch {
            this._onPollFailure();
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

    dispose(): void {
        this._stopPolling();
        this._onDidChange.dispose();
    }
}
