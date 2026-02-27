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

export class ModelDataProvider implements vscode.Disposable {
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _visible = false;
    private _client: LanguageClient | null;

    /** Exponential backoff: number of consecutive failures (0 = healthy). */
    private _backoff = 0;
    /** Skip counter: decremented each poll cycle; polls are skipped while > 0. */
    private _skipCount = 0;

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
    async refreshNow(): Promise<void> {
        if (!this._client || this._client.state !== 2 /* Running */) {
            return;
        }
        if (this._shouldSkip()) {
            return;
        }
        try {
            const [actions, summary, gaps] = await Promise.all([
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
            this.actionRequirements = actions;
            this.modelSummary = summary;
            this.coverageGaps = gaps;
            this._onPollSuccess();
            this._onDidChange.fire();
        } catch {
            this._onPollFailure();
        }
    }

    /** Fetch graph endpoints (only when webview is open). */
    async refreshGraphs(): Promise<void> {
        if (!this._client || this._client.state !== 2) {
            return;
        }
        try {
            const [dep, sm] = await Promise.all([
                this._sendWithTimeout<ActionDependencyGraphResponse>(
                    "ivy/actionDependencyGraph"
                ),
                this._sendWithTimeout<StateMachineViewResponse>(
                    "ivy/stateMachineView"
                ),
            ]);
            this.dependencyGraph = dep;
            this.stateMachine = sm;
            this._onDidChange.fire();
        } catch {
            // Endpoints may not exist yet (Phase 5).
        }
    }

    /** Send a request with a timeout to prevent indefinite hangs. */
    private _sendWithTimeout<T>(method: string): Promise<T> {
        return Promise.race([
            this._client!.sendRequest<T>(method, null),
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
