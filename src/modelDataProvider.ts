/**
 * Polling provider for visualization model data.
 *
 * Separate from LspStateTracker: polls at 30s (model data is large and
 * changes infrequently) vs 2-3s for monitoring data.  Only polls when
 * a consumer (tree view or webview) is visible.
 */

import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import {
    ActionRequirementsResponse,
    ModelSummaryResponse,
    CoverageGapsResponse,
    ActionDependencyGraphResponse,
    StateMachineViewResponse,
} from "./requirements/requirementTypes";

const POLL_INTERVAL_MS = 30_000;
/** Longer timeout for the first poll while the server may still be indexing. */
const STARTUP_TIMEOUT_MS = 60_000;
/** Fast retry interval used when model data is not yet ready. */
const FAST_RETRY_MS = 3_000;
/** Max number of fast retries before falling back to normal interval. */
const MAX_FAST_RETRIES = 10;

export class ModelDataProvider implements vscode.Disposable {
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _fastRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private _visible = false;
    private _client: LanguageClient | null;
    private _refreshing = false;
    private _notificationDisposable: { dispose(): void } | null = null;

    /** Exponential backoff: number of consecutive failures (0 = healthy). */
    private _backoff = 0;
    /** Skip counter: decremented each poll cycle; polls are skipped while > 0. */
    private _skipCount = 0;
    /** Fast retry counter: >0 while model hasn't sent modelReady=true yet. */
    private _fastRetries = MAX_FAST_RETRIES;
    /** Set to true once the first ivy/modelReady notification arrives. */
    private _modelReadyReceived = false;

    /** Cached responses from the LSP server. */
    public actionRequirements: ActionRequirementsResponse | null = null;
    public modelSummary: ModelSummaryResponse | null = null;
    public coverageGaps: CoverageGapsResponse | null = null;
    public dependencyGraph: ActionDependencyGraphResponse | null = null;
    public stateMachine: StateMachineViewResponse | null = null;

    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    constructor(client: LanguageClient | null) {
        this._client = client;
    }

    /** Update the underlying client (e.g. after restart). Resets cached state. */
    setClient(newClient: LanguageClient | null): void {
        console.log("[ivy-model] setClient called, client =", newClient ? "present" : "null",
            ", visible =", this._visible, ", state =", newClient?.state);
        this._stopPolling();
        this._notificationDisposable?.dispose();
        this._notificationDisposable = null;
        this._client = newClient;
        this.actionRequirements = null;
        this.modelSummary = null;
        this.coverageGaps = null;
        this.dependencyGraph = null;
        this.stateMachine = null;
        this._backoff = 0;
        this._skipCount = 0;
        this._fastRetries = MAX_FAST_RETRIES;
        this._modelReadyReceived = false;

        // Listen for server-push readiness notification.
        if (newClient) {
            this._notificationDisposable = newClient.onNotification("ivy/modelReady", (params: any) => {
                console.log("[ivy-model] Received ivy/modelReady notification:", params);
                this._modelReadyReceived = true;
                this._clearFastRetryTimer();
                this._fastRetries = MAX_FAST_RETRIES;
                // The notification may arrive while the client is still
                // transitioning to Running (state 2).  Poll until ready,
                // but give up after a bounded number of retries.
                let readyRetries = 15; // 15 * 200ms = 3s max wait
                const tryRefresh = () => {
                    if (this._client && this._client.state === 2 /* Running */) {
                        this.refreshNow(true);
                    } else if (readyRetries-- > 0) {
                        console.log("[ivy-model] modelReady: client state =", this._client?.state, ", deferring 200ms");
                        setTimeout(tryRefresh, 200);
                    } else {
                        console.warn("[ivy-model] modelReady: gave up waiting for client Running state");
                    }
                };
                tryRefresh();
            });
        }

        this._onDidChange.fire();
        if (this._visible && newClient) {
            this._startPolling();
        }
    }

    /** Start or stop polling based on view visibility. */
    setVisible(visible: boolean): void {
        this._visible = visible;
        if (visible) {
            this._startPolling();
        } else {
            this._stopPolling();
        }
    }

    /** Force an immediate refresh of core cached data.
     *
     * Requests are sent sequentially to avoid flooding the LSP stdio
     * pipe (concurrent large responses can trigger OOM in Node.js).
     * The first poll is deferred until an ``ivy/modelReady``
     * notification has been received so we don't bombard a server that
     * is still indexing.
     */
    async refreshNow(force = false): Promise<void> {
        console.log("[ivy-model] refreshNow called: force =", force,
            ", client =", this._client ? "present" : "null",
            ", state =", this._client?.state,
            ", modelReadyReceived =", this._modelReadyReceived);
        if (!this._client || this._client.state !== 2 /* Running */) {
            console.log("[ivy-model] refreshNow: client not ready, state =", this._client?.state);
            return;
        }
        // Skip polling until the server signals readiness (unless forced
        // by a modelReady notification handler or explicit user action).
        if (!force && !this._modelReadyReceived) {
            console.log("[ivy-model] refreshNow: waiting for modelReady notification");
            return;
        }
        if (!force && this._shouldSkip()) {
            return;
        }
        // Guard against concurrent calls (overlap from timer + fast retry).
        if (this._refreshing) {
            return;
        }
        this._refreshing = true;

        const delay = (ms: number) =>
            new Promise<void>((r) => setTimeout(r, ms));

        let anySuccess = false;

        try {
            // Sequential requests with small gaps
            try {
                const actions =
                    await this._sendWithTimeout<ActionRequirementsResponse>(
                        "ivy/actionRequirements"
                    );
                console.log("[ivy-model] ivy/actionRequirements raw response:",
                    JSON.stringify(actions).substring(0, 2000));
                this.actionRequirements = actions;
                anySuccess = true;
            } catch (err) {
                console.warn("[ivy-model] ivy/actionRequirements failed:", err);
            }

            await delay(100);

            try {
                const summary =
                    await this._sendWithTimeout<ModelSummaryResponse>(
                        "ivy/modelSummaryTable"
                    );
                this.modelSummary = summary;
                anySuccess = true;
            } catch (err) {
                console.warn("[ivy-model] ivy/modelSummaryTable failed:", err);
            }

            await delay(100);

            try {
                const gaps = await this._sendWithTimeout<CoverageGapsResponse>(
                    "ivy/coverageGaps"
                );
                this.coverageGaps = gaps;
                anySuccess = true;
            } catch (err) {
                console.warn("[ivy-model] ivy/coverageGaps failed:", err);
            }

            if (anySuccess) {
                this._onPollSuccess();
            } else {
                this._onPollFailure();
            }

            // Log the state for debugging.
            const modelReady = this.actionRequirements?.modelReady ?? null;
            const actionCount = this.actionRequirements?.actions?.length ?? 0;
            console.log(
                `[ivy-model] refreshNow: modelReady=${modelReady}, actions=${actionCount}, fastRetries=${this._fastRetries}`
            );

            // If the model isn't ready yet, schedule a fast retry instead of
            // waiting the full 30-second interval.
            this._clearFastRetryTimer();
            if (!modelReady && this._fastRetries > 0) {
                this._fastRetries--;
                this._fastRetryTimer = setTimeout(() => this.refreshNow(true), FAST_RETRY_MS);
            } else if (modelReady) {
                this._fastRetries = 0;  // model is ready, no more fast retries
            }

            this._onDidChange.fire();
        } finally {
            this._refreshing = false;
        }
    }

    /** Fetch graph endpoints (only when webview is open). */
    async refreshGraphs(): Promise<void> {
        if (!this._client || this._client.state !== 2) {
            return;
        }
        const [depResult, smResult] = await Promise.allSettled([
            this._sendWithTimeout<ActionDependencyGraphResponse>(
                "ivy/actionDependencyGraph"
            ),
            this._sendWithTimeout<StateMachineViewResponse>(
                "ivy/stateMachineView"
            ),
        ]);
        if (depResult.status === "fulfilled") {
            this.dependencyGraph = depResult.value;
        } else {
            console.warn(
                "ivy/actionDependencyGraph failed:",
                depResult.reason
            );
        }
        if (smResult.status === "fulfilled") {
            this.stateMachine = smResult.value;
        } else {
            console.warn("ivy/stateMachineView failed:", smResult.reason);
        }
        this._onDidChange.fire();
    }

    /** Send a request with a timeout to prevent indefinite hangs. */
    private _sendWithTimeout<T>(method: string): Promise<T> {
        const configuredMs =
            vscode.workspace
                .getConfiguration("ivy")
                .get<number>("lsp.panelRequestTimeout", 30) * 1000;
        const timeout =
            this.actionRequirements === null
                ? Math.max(configuredMs, STARTUP_TIMEOUT_MS)
                : configuredMs;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`${method} timed out after ${timeout}ms`)),
                timeout,
            );
            this._client!.sendRequest<T>(method, null).then(
                (result) => { clearTimeout(timer); resolve(result); },
                (err) => { clearTimeout(timer); reject(err); },
            );
        });
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

    private _startPolling(): void {
        if (this._timer) {
            return;
        }
        this.refreshNow();
        this._timer = setInterval(() => this.refreshNow(), POLL_INTERVAL_MS);
    }

    private _clearFastRetryTimer(): void {
        if (this._fastRetryTimer) {
            clearTimeout(this._fastRetryTimer);
            this._fastRetryTimer = null;
        }
    }

    private _stopPolling(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        this._clearFastRetryTimer();
    }

    dispose(): void {
        this._stopPolling();
        this._notificationDisposable?.dispose();
        this._notificationDisposable = null;
        this._onDidChange.dispose();
    }
}
