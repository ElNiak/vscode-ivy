/** Polling orchestrator for ivy-lsp monitoring endpoints. */

import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import {
    ServerStatus,
    IndexerStats,
    OperationHistory,
    ActionResult,
} from "./monitorTypes";

/** Client-side state tracker that polls the LSP server for monitoring data. */
export class LspStateTracker implements vscode.Disposable {
    private _statusTimer: ReturnType<typeof setInterval> | null = null;
    private _statsTimer: ReturnType<typeof setInterval> | null = null;
    private _historyTimer: ReturnType<typeof setInterval> | null = null;
    private _visible = false;

    /** Cached state from most recent poll. */
    public serverStatus: ServerStatus | null = null;
    public indexerStats: IndexerStats | null = null;
    public operationHistory: OperationHistory | null = null;

    /** State-change detection for toast notifications. */
    private _prevIndexingState: string | null = null;
    private _prevStaleCount = 0;

    /** Fires when any cached state changes. */
    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    constructor(private readonly client: LanguageClient | null) {}

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
            const [status, stats, history] = await Promise.all([
                this.client.sendRequest<ServerStatus>("ivy/serverStatus", null),
                this.client.sendRequest<IndexerStats>("ivy/indexerStats", null),
                this.client.sendRequest<OperationHistory>(
                    "ivy/operationHistory",
                    null
                ),
            ]);
            this.serverStatus = status;
            this.indexerStats = stats;
            this.operationHistory = history;
            this._checkForStateChanges();
            this._onDidChange.fire();
        } catch {
            this.serverStatus = null;
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
        this._statusTimer = null;
        this._statsTimer = null;
        this._historyTimer = null;
    }

    private async _pollStatus(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        try {
            this.serverStatus =
                await this.client.sendRequest<ServerStatus>("ivy/serverStatus", null);
            this._checkForStateChanges();
            this._onDidChange.fire();
        } catch {
            /* server not ready */
        }
    }

    private async _pollStats(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        try {
            this.indexerStats =
                await this.client.sendRequest<IndexerStats>("ivy/indexerStats", null);
            this._onDidChange.fire();
        } catch {
            /* server not ready */
        }
    }

    private async _pollHistory(): Promise<void> {
        if (!this.client || this.client.state !== 2) {
            return;
        }
        try {
            this.operationHistory =
                await this.client.sendRequest<OperationHistory>(
                    "ivy/operationHistory",
                    null
                );
            this._onDidChange.fire();
        } catch {
            /* server not ready */
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

    dispose(): void {
        this._stopPolling();
        this._onDidChange.dispose();
    }
}
