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
const POLL_TIMEOUT_MS = 10_000;
/** Longer timeout for the first poll while the server may still be indexing. */
const STARTUP_TIMEOUT_MS = 60_000;
/** Fast retry interval used when model data is not yet ready. */
const FAST_RETRY_MS = 3_000;
/** Max number of fast retries before falling back to normal interval. */
const MAX_FAST_RETRIES = 10;

export class ModelDataProvider implements vscode.Disposable {
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _visible = false;
    private _client: LanguageClient | null;

    /** Exponential backoff: number of consecutive failures (0 = healthy). */
    private _backoff = 0;
    /** Skip counter: decremented each poll cycle; polls are skipped while > 0. */
    private _skipCount = 0;
    /** Fast retry counter: >0 while model hasn't sent modelReady=true yet. */
    private _fastRetries = MAX_FAST_RETRIES;

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
        this._stopPolling();
        this._client = newClient;
        this.actionRequirements = null;
        this.modelSummary = null;
        this.coverageGaps = null;
        this.dependencyGraph = null;
        this.stateMachine = null;
        this._backoff = 0;
        this._skipCount = 0;
        this._fastRetries = MAX_FAST_RETRIES;

        // Listen for server-push readiness notification.
        if (newClient) {
            newClient.onNotification("ivy/modelReady", (params: any) => {
                console.log("[ivy-model] Received ivy/modelReady notification:", params);
                this._fastRetries = MAX_FAST_RETRIES;
                this.refreshNow(true);
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

    /** Force an immediate refresh of core cached data. */
    async refreshNow(force = false): Promise<void> {
        if (!this._client || this._client.state !== 2 /* Running */) {
            console.log("[ivy-model] refreshNow: client not ready, state =", this._client?.state);
            return;
        }
        if (!force && this._shouldSkip()) {
            return;
        }

        const [actionsResult, summaryResult, gapsResult] =
            await Promise.allSettled([
                this._sendWithTimeout<ActionRequirementsResponse>(
                    "ivy/actionRequirements"
                ),
                this._sendWithTimeout<ModelSummaryResponse>(
                    "ivy/modelSummaryTable"
                ),
                this._sendWithTimeout<CoverageGapsResponse>(
                    "ivy/coverageGaps"
                ),
            ]);

        let anySuccess = false;
        if (actionsResult.status === "fulfilled") {
            this.actionRequirements = actionsResult.value;
            anySuccess = true;
        } else {
            console.warn(
                "[ivy-model] ivy/actionRequirements failed:",
                actionsResult.reason
            );
        }
        if (summaryResult.status === "fulfilled") {
            this.modelSummary = summaryResult.value;
            anySuccess = true;
        } else {
            console.warn(
                "[ivy-model] ivy/modelSummaryTable failed:",
                summaryResult.reason
            );
        }
        if (gapsResult.status === "fulfilled") {
            this.coverageGaps = gapsResult.value;
            anySuccess = true;
        } else {
            console.warn("[ivy-model] ivy/coverageGaps failed:", gapsResult.reason);
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
        if (!modelReady && this._fastRetries > 0) {
            this._fastRetries--;
            setTimeout(() => this.refreshNow(true), FAST_RETRY_MS);
        } else if (modelReady) {
            this._fastRetries = 0;  // model is ready, no more fast retries
        }

        this._onDidChange.fire();
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
        const timeout =
            this.actionRequirements === null
                ? STARTUP_TIMEOUT_MS
                : POLL_TIMEOUT_MS;
        return Promise.race([
            this._client!.sendRequest<T>(method, null),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`${method} timed out after ${timeout}ms`)),
                    timeout
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

    private _startPolling(): void {
        if (this._timer) {
            return;
        }
        this.refreshNow();
        this._timer = setInterval(() => this.refreshNow(), POLL_INTERVAL_MS);
    }

    private _stopPolling(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    dispose(): void {
        this._stopPolling();
        this._onDidChange.dispose();
    }
}
