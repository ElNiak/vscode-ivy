/**
 * Polling provider for visualization model data.
 *
 * Separate from LspStateTracker: polls at 30s (model data is large and
 * changes infrequently) vs 2-3s for monitoring data.  Only polls when
 * a consumer (tree view or webview) is visible.
 */

import * as vscode from "vscode";
import { LanguageClient, State } from "vscode-languageclient/node";
import {
    ActionRequirementsResponse,
    ModelSummaryResponse,
    CoverageGapsResponse,
    ActionDependencyGraphResponse,
    StateMachineViewResponse,
    LayeredOverviewResponse,
} from "./requirements/requirementTypes";
import { ModelReadyNotification } from "./monitorTypes";
import { RequestSerializer } from "./requestSerializer";

const POLL_INTERVAL_MS = 30_000;
/** Longer timeout for the first poll while the server may still be indexing. */
const STARTUP_TIMEOUT_MS = 60_000;
/** Fast retry interval used when model data is not yet ready. */
const FAST_RETRY_MS = 3_000;
/** Max number of fast retries before falling back to normal interval. */
const MAX_FAST_RETRIES = 10;
/** Slower retry interval (ms) used after fast retries are exhausted. */
const SLOW_RETRY_MS = 30_000;
/** After this many slow retries without modelReady, show a warning (5 min). */
const MAX_SLOW_RETRIES_BEFORE_WARNING = 10;

export class ModelDataProvider implements vscode.Disposable {
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _fastRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private _visible = false;
    private _client: LanguageClient | null;
    private _refreshing = false;
    private _notificationDisposable: { dispose(): void } | null = null;
    /** Version counter incremented on each setClient() to invalidate stale modelReady retry timers. */
    private _clientVersion = 0;

    /** Exponential backoff: number of consecutive failures (0 = healthy). */
    private _backoff = 0;
    /** Skip counter: decremented each poll cycle; polls are skipped while > 0. */
    private _skipCount = 0;
    /** Fast retry counter: >0 while model hasn't sent modelReady=true yet. */
    private _fastRetries = MAX_FAST_RETRIES;
    /** Set to true once the first ivy/modelReady notification arrives. */
    private _modelReadyReceived = false;
    /** Slow retry counter: incremented after fast retries exhausted. */
    private _slowRetries = 0;
    /** True after a "model not ready" warning has been shown, to avoid spam. */
    private _modelNotReadyWarningShown = false;
    /** Handle for the 180-second safety fallback timer, so it can be cancelled on dispose. */
    private _safetyTimer: ReturnType<typeof setTimeout> | null = null;
    /** Set to true once dispose() is called; prevents stale callbacks from firing. */
    private _disposed = false;

    /** Active test file for scoped visualization requests. */
    private _activeTestFile: string | null = null;

    /** Whether a refresh cycle is currently in progress. */
    get isRefreshing(): boolean {
        return this._refreshing;
    }

    /** Per-endpoint error state so UI consumers can show warning indicators. */
    public readonly endpointErrors = new Map<string, string>();

    /** Cached responses from the LSP server. */
    public actionRequirements: ActionRequirementsResponse | null = null;
    public modelSummary: ModelSummaryResponse | null = null;
    public coverageGaps: CoverageGapsResponse | null = null;
    public dependencyGraph: ActionDependencyGraphResponse | null = null;
    public stateMachine: StateMachineViewResponse | null = null;
    public layeredOverview: LayeredOverviewResponse | null = null;

    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    private _serializer?: RequestSerializer;

    constructor(client: LanguageClient | null, serializer?: RequestSerializer) {
        this._client = client;
        this._serializer = serializer;
    }

    /** Update the underlying client (e.g. after restart). Resets cached state. */
    setClient(newClient: LanguageClient | null): void {
        // Cancel any pending safety timer from a previous client.
        if (this._safetyTimer) {
            clearTimeout(this._safetyTimer);
            this._safetyTimer = null;
        }
        console.debug("[ivy-model] setClient called, client =", newClient ? "present" : "null",
            ", visible =", this._visible, ", state =", newClient?.state);
        this._stopPolling();
        this._notificationDisposable?.dispose();
        this._notificationDisposable = null;
        this._clientVersion++;
        this._client = newClient;
        this.actionRequirements = null;
        this.modelSummary = null;
        this.coverageGaps = null;
        this.dependencyGraph = null;
        this.stateMachine = null;
        this.layeredOverview = null;
        this.endpointErrors.clear();
        this._backoff = 0;
        this._skipCount = 0;
        this._fastRetries = MAX_FAST_RETRIES;
        this._slowRetries = 0;
        this._modelNotReadyWarningShown = false;
        this._modelReadyReceived = false;

        // Listen for server-push readiness notification.
        if (newClient) {
            const capturedVersion = this._clientVersion;
            this._notificationDisposable = newClient.onNotification(
                "ivy/modelReady",
                (params: ModelReadyNotification) => {
                    console.debug("[ivy-model] Received ivy/modelReady notification:", params);
                    // Stale notification from a previous client — ignore.
                    if (this._clientVersion !== capturedVersion) {
                        return;
                    }
                    this._modelReadyReceived = true;
                    this._clearFastRetryTimer();
                    this._fastRetries = MAX_FAST_RETRIES;
                    // The notification may arrive while the client is still
                    // transitioning to Running (state 2).  Poll until ready,
                    // but give up after a bounded number of retries.
                    let readyRetries = 15; // 15 * 200ms = 3s max wait
                    const tryRefresh = () => {
                        // Bail if client was replaced since the notification.
                        if (this._clientVersion !== capturedVersion) {
                            return;
                        }
                        if (this._client && this._client.state === State.Running) {
                            this.refreshNow(true);
                        } else if (readyRetries-- > 0) {
                            console.debug("[ivy-model] modelReady: client state =", this._client?.state, ", deferring 200ms");
                            setTimeout(tryRefresh, 200);
                        } else {
                            console.warn(
                                "[ivy-model] modelReady: client did not reach Running state after 3s.",
                                "Model data will be fetched when the safety timer fires or on manual refresh."
                            );
                        }
                    };
                    tryRefresh();
                },
            );
        }

        // Safety fallback: if no modelReady notification arrives within 180s,
        // try a forced refresh anyway.
        if (newClient) {
            const capturedVersion = this._clientVersion;
            this._safetyTimer = setTimeout(() => {
                this._safetyTimer = null;
                if (this._clientVersion === capturedVersion && !this._modelReadyReceived) {
                    console.warn(
                        "[ivy-model] No ivy/modelReady after 180s, forcing refresh.",
                        "Model data may be incomplete if indexing is still in progress."
                    );
                    this._modelReadyReceived = true;
                    this.refreshNow(true);
                }
            }, 180_000);
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

    /** Update the active test file used to scope visualization requests. */
    setActiveTestFile(testFile: string | null): void {
        this._activeTestFile = testFile;
    }

    /** Build scope params to pass to visualization endpoints. */
    private _getScopeParams(): Record<string, unknown> | null {
        return this._activeTestFile ? { testFile: this._activeTestFile } : null;
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
        this._clearFastRetryTimer();  // Always clear pending retry before new refresh
        if (this._disposed) { return; }
        console.debug("[ivy-model] refreshNow called: force =", force,
            ", client =", this._client ? "present" : "null",
            ", state =", this._client?.state,
            ", modelReadyReceived =", this._modelReadyReceived);
        if (!this._client || this._client.state !== State.Running) {
            console.debug("[ivy-model] refreshNow: client not ready, state =", this._client?.state);
            return;
        }
        // Skip polling until the server signals readiness (unless forced
        // by a modelReady notification handler or explicit user action).
        if (!force && !this._modelReadyReceived) {
            console.debug("[ivy-model] refreshNow: waiting for modelReady notification");
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

        const doRefresh = async (): Promise<void> => {
            // Re-check client after serializer deferral — it may have been
            // nulled by setClient(null) while waiting for the lock.
            if (!this._client || this._client.state !== State.Running) {
                this._refreshing = false;
                return;
            }

            const delay = (ms: number) =>
                new Promise<void>((r) => setTimeout(r, ms));

            let anySuccess = false;

            try {
                const scopeParams = this._getScopeParams();

                // Sequential requests with small gaps
                try {
                    const actions =
                        await this._sendWithTimeout<ActionRequirementsResponse>(
                            "ivy/actionRequirements",
                            scopeParams,
                        );
                    // Basic shape validation to catch malformed responses.
                    if (actions && typeof actions === "object" && "modelReady" in actions) {
                        this.actionRequirements = actions;
                        this.endpointErrors.delete("actionRequirements");
                        anySuccess = true;
                        if (actions.pagination?.hasMore) {
                            console.warn(
                                `[ivy-model] ivy/actionRequirements returned paginated result ` +
                                `(total=${actions.pagination.total}, shown=${actions.actions.length}). ` +
                                `Pagination not yet implemented — only first page displayed.`
                            );
                            this.endpointErrors.set(
                                "actionRequirements",
                                `Showing ${actions.actions.length} of ${actions.pagination.total} actions`
                            );
                        }
                    } else {
                        console.warn("[ivy-model] ivy/actionRequirements: unexpected shape", actions);
                        this.endpointErrors.set("actionRequirements", "Malformed response");
                    }
                } catch (err) {
                    console.warn("[ivy-model] ivy/actionRequirements failed:", err);
                    this.endpointErrors.set("actionRequirements", String(err));
                }

                await delay(250);

                try {
                    const summary =
                        await this._sendWithTimeout<ModelSummaryResponse>(
                            "ivy/modelSummaryTable",
                            scopeParams,
                        );
                    if (summary && typeof summary === "object" && "rows" in summary && "totals" in summary) {
                        this.modelSummary = summary;
                        this.endpointErrors.delete("modelSummary");
                        anySuccess = true;
                    } else {
                        console.warn("[ivy-model] ivy/modelSummaryTable: unexpected shape", summary);
                        this.endpointErrors.set("modelSummary", "Malformed response");
                    }
                } catch (err) {
                    console.warn("[ivy-model] ivy/modelSummaryTable failed:", err);
                    this.endpointErrors.set("modelSummary", String(err));
                }

                await delay(250);

                try {
                    const gaps = await this._sendWithTimeout<CoverageGapsResponse>(
                        "ivy/coverageGaps",
                        scopeParams,
                    );
                    if (gaps && typeof gaps === "object" && "summary" in gaps) {
                        this.coverageGaps = gaps;
                        this.endpointErrors.delete("coverageGaps");
                        anySuccess = true;
                    } else {
                        console.warn("[ivy-model] ivy/coverageGaps: unexpected shape", gaps);
                        this.endpointErrors.set("coverageGaps", "Malformed response");
                    }
                } catch (err) {
                    console.warn("[ivy-model] ivy/coverageGaps failed:", err);
                    this.endpointErrors.set("coverageGaps", String(err));
                }

                await delay(250);

                try {
                    const layers =
                        await this._sendWithTimeout<LayeredOverviewResponse>(
                            "ivy/layeredOverview",
                            scopeParams,
                        );
                    if (layers && typeof layers === "object" && "layers" in layers) {
                        this.layeredOverview = layers;
                        this.endpointErrors.delete("layeredOverview");
                        anySuccess = true;
                    } else {
                        console.warn("[ivy-model] ivy/layeredOverview: unexpected shape", layers);
                        this.endpointErrors.set("layeredOverview", "Malformed response");
                    }
                } catch (err) {
                    console.warn("[ivy-model] ivy/layeredOverview failed:", err);
                    this.endpointErrors.set("layeredOverview", String(err));
                }

                if (anySuccess) {
                    this._onPollSuccess();
                } else {
                    this._onPollFailure();
                    if (this._backoff >= 3) {
                        console.warn(
                            "[ivy-model] All model endpoints failed for",
                            this._backoff, "consecutive cycles"
                        );
                    }
                }

                // Log the state for debugging.
                const modelReady = this.actionRequirements?.modelReady ?? null;
                const actionCount = this.actionRequirements?.actions?.length ?? 0;
                console.debug(
                    `[ivy-model] refreshNow: modelReady=${modelReady}, actions=${actionCount}, fastRetries=${this._fastRetries}`
                );

                // If the model isn't ready yet, schedule retries to avoid
                // the UI getting stuck on "Indexing..." forever.
                this._clearFastRetryTimer();
                if (!modelReady && this._fastRetries > 0) {
                    this._fastRetries--;
                    this._fastRetryTimer = setTimeout(() => this.refreshNow(true), FAST_RETRY_MS);
                } else if (!modelReady && this._fastRetries <= 0) {
                    // Fast retries exhausted — fall back to slower retries
                    // instead of stopping entirely.
                    this._slowRetries++;
                    if (
                        this._slowRetries >= MAX_SLOW_RETRIES_BEFORE_WARNING &&
                        !this._modelNotReadyWarningShown
                    ) {
                        this._modelNotReadyWarningShown = true;
                        console.warn(
                            "[ivy-model] Model still not ready after",
                            MAX_FAST_RETRIES, "fast +",
                            this._slowRetries, "slow retries",
                        );
                    }
                    this._fastRetryTimer = setTimeout(
                        () => this.refreshNow(true),
                        SLOW_RETRY_MS,
                    );
                } else if (modelReady) {
                    this._fastRetries = 0;  // model is ready, no more retries
                    this._slowRetries = 0;
                }

                this._onDidChange.fire();
            } catch (outerErr) {
                console.error("[ivy-model] Unexpected error in refreshNow:", outerErr);
                this._onPollFailure();
                if (this._backoff >= 3) {
                    this.endpointErrors.set(
                        "_refresh",
                        `Repeated refresh failure: ${outerErr instanceof Error ? outerErr.message : String(outerErr)}`,
                    );
                    this._onDidChange.fire();
                }
            } finally {
                this._refreshing = false;
            }
        };

        if (this._serializer) {
            await this._serializer.run(doRefresh);
        } else {
            await doRefresh();
        }
    }

    /** Fetch graph endpoints (only when webview is open).
     *
     * Requests are sent sequentially (like {@link refreshNow}) to avoid
     * flooding the LSP stdio pipe — graph responses can be large.
     */
    async refreshGraphs(): Promise<void> {
        if (!this._client || this._client.state !== State.Running) {
            return;
        }
        const doRefresh = async (): Promise<void> => {
            const scopeParams = this._getScopeParams();
            try {
                const graph =
                    await this._sendWithTimeout<ActionDependencyGraphResponse>(
                        "ivy/actionDependencyGraph",
                        scopeParams,
                    );
                if (graph && typeof graph === "object" && "nodes" in graph && "edges" in graph) {
                    this.dependencyGraph = graph;
                    this.endpointErrors.delete("dependencyGraph");
                } else {
                    console.warn("[ivy-model] ivy/actionDependencyGraph: unexpected shape", graph);
                    this.endpointErrors.set("dependencyGraph", "Malformed response");
                }
            } catch (err) {
                console.warn("[ivy-model] ivy/actionDependencyGraph failed:", err);
                this.endpointErrors.set("dependencyGraph", String(err));
                this.dependencyGraph = null;
            }
            try {
                const sm =
                    await this._sendWithTimeout<StateMachineViewResponse>(
                        "ivy/stateMachineView",
                        scopeParams,
                    );
                if (sm && typeof sm === "object" && "nodes" in sm && "transitions" in sm) {
                    this.stateMachine = sm;
                    this.endpointErrors.delete("stateMachine");
                } else {
                    console.warn("[ivy-model] ivy/stateMachineView: unexpected shape", sm);
                    this.endpointErrors.set("stateMachine", "Malformed response");
                }
            } catch (err) {
                console.warn("[ivy-model] ivy/stateMachineView failed:", err);
                this.endpointErrors.set("stateMachine", String(err));
                this.stateMachine = null;
            }
            this._onDidChange.fire();
        };
        if (this._serializer) {
            await this._serializer.run(doRefresh);
        } else {
            await doRefresh();
        }
    }

    /** Send a request with a timeout to prevent indefinite hangs. */
    private _sendWithTimeout<T>(
        method: string,
        params?: Record<string, unknown> | null,
    ): Promise<T> {
        const configuredMs =
            vscode.workspace
                .getConfiguration("ivy")
                .get<number>("lsp.panelRequestTimeout", 30) * 1000;
        const timeout =
            this.actionRequirements === null
                ? Math.max(configuredMs, STARTUP_TIMEOUT_MS)
                : configuredMs;
        return new Promise<T>((resolve, reject) => {
            if (!this._client) {
                reject(new Error(`${method}: client is null`));
                return;
            }
            const timer = setTimeout(
                () => reject(new Error(`${method} timed out after ${timeout}ms`)),
                timeout,
            );
            this._client.sendRequest<T>(method, params ?? null).then(
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
        // Don't call refreshNow() immediately — wait for modelReady
        // notification or explicit user interaction to avoid startup storm.
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
        if (this._safetyTimer) {
            clearTimeout(this._safetyTimer);
            this._safetyTimer = null;
        }
    }

    dispose(): void {
        this._disposed = true;
        this._stopPolling();
        this._notificationDisposable?.dispose();
        this._notificationDisposable = null;
        this._onDidChange.dispose();
    }
}
