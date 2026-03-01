/** Webview dashboard panel for Ivy LSP monitoring. */

import * as vscode from "vscode";
import { LspStateTracker } from "./lspStateTracker";
import { formatDuration } from "./utils";

export class DashboardPanel {
    private static _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _disposed = false;

    static show(
        context: vscode.ExtensionContext,
        tracker: LspStateTracker
    ): void {
        if (DashboardPanel._panel) {
            DashboardPanel._panel.reveal();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            "ivyDashboard",
            "Ivy LSP Dashboard",
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        DashboardPanel._panel = panel;

        const instance = new DashboardPanel(panel, tracker);
        instance._disposables.push(
            panel.onDidDispose(() => {
                DashboardPanel._panel = undefined;
                instance.dispose();
            })
        );
    }

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly tracker: LspStateTracker
    ) {
        this._update();
        this._disposables.push(
            tracker.onDidChange(() => this._update()),
            this.panel.webview.onDidReceiveMessage((msg) =>
                this._handleMessage(msg)
            )
        );
    }

    private _update(): void {
        if (this._disposed) { return; }
        this.panel.webview.html = this._getHtml();
    }

    private async _handleMessage(msg: {
        type: string;
        action?: string;
    }): Promise<void> {
        try {
            switch (msg.action) {
                case "reindex":
                    await this.tracker.sendReindex();
                    break;
                case "clearCache":
                    await this.tracker.sendClearCache();
                    break;
                case "restart":
                    await vscode.commands.executeCommand("ivy.resetServer");
                    break;
                case "refresh":
                    await this.tracker.refreshNow();
                    break;
            }
        } catch (err) {
            console.error("[ivy-dashboard] Action failed:", msg.action, err);
            vscode.window.showErrorMessage(
                `Ivy Dashboard: ${msg.action ?? "action"} failed`
            );
        }
    }

    private _getHtml(): string {
        const nonce = getNonce();
        const s = this.tracker.serverStatus;
        const stats = this.tracker.indexerStats;
        const history = this.tracker.operationHistory;
        const featureStatus = this.tracker.featureStatus;

        const modeColor = s?.mode === "full" ? "#4caf50" : "#ff9800";
        const modeBadge = s
            ? `<span class="badge" style="background:${modeColor}">${s.mode}</span>`
            : "N/A";

        const opsRows = (history?.operations ?? [])
            .slice(0, 20)
            .map((op) => {
                const icon = op.success ? "&#x2713;" : "&#x2717;";
                const color = op.success ? "#4caf50" : "#f44336";
                return `<tr>
        <td style="color:${color}">${icon}</td>
        <td>${escapeHtml(op.type)}</td>
        <td>${op.file ? escapeHtml(op.file.split("/").pop() ?? "") : "-"}</td>
        <td>${op.duration.toFixed(1)}s</td>
        <td>${new Date(op.startTime).toLocaleTimeString()}</td>
      </tr>`;
            })
            .join("");

        const featureRows = (featureStatus?.features ?? [])
            .map((f) => {
                const color =
                    f.status === "ready"
                        ? "#4caf50"
                        : f.status === "degraded"
                          ? "#ff9800"
                          : f.status === "loading"
                            ? "#2196f3"
                            : "#f44336";
                const icon =
                    f.status === "ready"
                        ? "&#x2713;"
                        : f.status === "degraded"
                          ? "&#x26A0;"
                          : f.status === "loading"
                            ? "&#x21BB;"
                            : "&#x2717;";
                return `<tr>
        <td style="color:${color}">${icon}</td>
        <td>${escapeHtml(f.name)}</td>
        <td style="color:${color}">${escapeHtml(f.status)}</td>
        <td>${escapeHtml(f.reason)}</td>
      </tr>`;
            })
            .join("");

        const pd = this.tracker.pipelineDetail;

        const testMatrix = this.tracker.testFeatureMatrix;
        const testMatrixRows = (testMatrix?.tests ?? [])
            .map((t) => {
                const file = escapeHtml(t.file.split("/").pop() ?? "");
                const cells = Object.entries(t.features)
                    .map(([, status]) => {
                        const color =
                            status === "ready"
                                ? "#4caf50"
                                : status === "degraded"
                                  ? "#ff9800"
                                  : "#f44336";
                        const icon =
                            status === "ready"
                                ? "&#x2713;"
                                : status === "degraded"
                                  ? "&#x26A0;"
                                  : "&#x2717;";
                        return `<td style="color:${color};text-align:center">${icon}</td>`;
                    })
                    .join("");
                return `<tr><td>${file}</td>${cells}</tr>`;
            })
            .join("");
        const testFeatureHeaders =
            testMatrix && testMatrix.tests.length > 0
                ? Object.keys(testMatrix.tests[0].features)
                      .map((k) => `<th>${escapeHtml(k.charAt(0).toUpperCase() + k.slice(1))}</th>`)
                      .join("")
                : "";

        const deepProg = this.tracker.deepIndexProgress;
        const deepPct =
            deepProg && deepProg.totalTests > 0
                ? Math.round(
                      (deepProg.completedTests / deepProg.totalTests) * 100
                  )
                : 0;
        const deepStatusLabel = deepProg
            ? deepProg.running
                ? `Parsing: ${deepProg.completedTests}/${deepProg.totalTests} test files`
                : `Complete: ${deepProg.completedTests}/${deepProg.totalTests}`
            : "Not available";
        const fileStatusRows = (deepProg?.fileStatuses ?? [])
            .map((fs) => {
                const icon = fs.deepParseSucceeded
                    ? "&#x2713;"
                    : fs.deepParseAttempted
                      ? "&#x2717;"
                      : "&#x25CB;";
                const color = fs.deepParseSucceeded
                    ? "#4caf50"
                    : fs.deepParseAttempted
                      ? "#f44336"
                      : "#aaa";
                const status = fs.deepParseSucceeded
                    ? "deep"
                    : fs.deepParseAttempted
                      ? "failed"
                      : "shallow";
                return `<tr>
            <td style="color:${color}">${icon}</td>
            <td>${escapeHtml(fs.file.split("/").pop() ?? "")}</td>
            <td>${escapeHtml(status)}</td>
            <td>${fs.parseError ? escapeHtml(fs.parseError) : "-"}</td>
          </tr>`;
            })
            .join("");

        return `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  .card h2 { margin-top: 0; font-size: 14px; }
  .badge { padding: 2px 8px; border-radius: 4px; color: white; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
  .stat { text-align: center; }
  .stat .value { font-size: 24px; font-weight: bold; }
  .stat .label { font-size: 11px; opacity: 0.7; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td, th { padding: 4px 8px; text-align: left; border-bottom: 1px solid var(--vscode-widget-border); }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head><body>
  <div class="card">
    <h2>Server ${modeBadge} v${escapeHtml(s?.version ?? "?")}</h2>
    <p>Uptime: ${s ? formatDuration(s.uptimeSeconds) : "N/A"}</p>
    <p>Indexing: ${escapeHtml(s?.indexingState ?? "unknown")}${s?.indexingError ? " - " + escapeHtml(s.indexingError) : ""}</p>
  </div>

  <div class="card">
    <h2>Indexing Statistics</h2>
    <div class="grid">
      <div class="stat"><div class="value">${stats?.fileCount ?? 0}</div><div class="label">Files</div></div>
      <div class="stat"><div class="value">${stats?.symbolCount ?? 0}</div><div class="label">Symbols</div></div>
      <div class="stat"><div class="value">${stats?.includeEdgeCount ?? 0}</div><div class="label">Includes</div></div>
      <div class="stat"><div class="value">${stats?.testScopeCount ?? 0}</div><div class="label">Tests</div></div>
      <div class="stat"><div class="value">${stats?.staleFiles?.length ?? 0}</div><div class="label">Stale</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Deep Indexing</h2>
    <p>${escapeHtml(deepStatusLabel)}</p>
    <div style="background: var(--vscode-editorWidget-border); border-radius: 4px; height: 8px; margin: 8px 0;">
      <div style="background: #4caf50; height: 100%; width: ${deepPct}%; border-radius: 4px; transition: width 0.3s;"></div>
    </div>
    <table>
      <tr><th></th><th>File</th><th>Depth</th><th>Error</th></tr>
      ${fileStatusRows || '<tr><td colspan="4">No data</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>Test Features</h2>
    <table>
      <tr><th>File</th>${testFeatureHeaders}</tr>
      ${testMatrixRows || '<tr><td colspan="7">No test data</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>Feature Status</h2>
    <table>
      <tr><th></th><th>Feature</th><th>Status</th><th>Details</th></tr>
      ${featureRows || '<tr><td colspan="4">Waiting for server...</td></tr>'}
    </table>
  </div>

  <div class="card">
    <h2>Analysis Pipeline</h2>
    <div class="grid">
      <div class="stat"><div class="value">${pd?.tiers.t1 ?? 0}</div><div class="label">T1 Files</div></div>
      <div class="stat"><div class="value">${pd?.tiers.t2 ?? 0}</div><div class="label">T2 Files</div></div>
      <div class="stat"><div class="value">${pd?.tiers.t3 ?? 0}</div><div class="label">T3 Files</div></div>
      <div class="stat"><div class="value">${pd?.semanticModel.nodeCount ?? 0}</div><div class="label">Sem. Nodes</div></div>
      <div class="stat"><div class="value">${pd?.semanticModel.edgeCount ?? 0}</div><div class="label">Sem. Edges</div></div>
    </div>
    <h3 style="margin-top:12px">Tier 3 Compilation</h3>
    <p>${pd?.tier3.running ? `&#x21BB; Compiling: ${escapeHtml((pd.tier3.currentFile ?? "").split("/").pop() ?? "")}` : pd?.tier3.fileCount ? `${pd.tier3.succeeded} passed, ${pd.tier3.failed} failed` : "No results yet"}</p>
    ${pd?.tier3.lastFile ? `<p style="font-size:11px;opacity:0.7">Last: ${escapeHtml(pd.tier3.lastFile.split("/").pop() ?? "")}</p>` : ""}
    ${pd?.compilation.running ? `
    <h3 style="margin-top:12px">Compilation</h3>
    <p>${pd.compilation.completed}/${pd.compilation.total} files</p>
    <div style="background:var(--vscode-editorWidget-border);border-radius:4px;height:8px;margin:4px 0">
      <div style="background:#2196f3;height:100%;width:${Math.round((pd.compilation.completed/Math.max(pd.compilation.total,1))*100)}%;border-radius:4px;transition:width 0.3s"></div>
    </div>
    ` : pd?.compilation.cachedFiles ? `<p style="margin-top:8px;font-size:11px;opacity:0.7">Compilation cache: ${pd.compilation.cachedFiles} files</p>` : ""}
    ${pd?.bulk.running ? `
    <h3 style="margin-top:12px">Bulk Analysis</h3>
    <p>${pd.bulk.completed}/${pd.bulk.total} files</p>
    <div style="background:var(--vscode-editorWidget-border);border-radius:4px;height:8px;margin:4px 0">
      <div style="background:#ff9800;height:100%;width:${Math.round((pd.bulk.completed/Math.max(pd.bulk.total,1))*100)}%;border-radius:4px;transition:width 0.3s"></div>
    </div>
    ` : ""}
  </div>

  <div class="card">
    <h2>Operation History</h2>
    <table>
      <tr><th></th><th>Type</th><th>File</th><th>Duration</th><th>Time</th></tr>
      ${opsRows || '<tr><td colspan="5">No operations yet</td></tr>'}
    </table>
  </div>

  <div class="actions">
    <button onclick="send('reindex')">Re-index</button>
    <button onclick="send('clearCache')">Clear Cache</button>
    <button onclick="send('restart')">Restart Server</button>
    <button onclick="send('refresh')">Refresh</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function send(action) { vscode.postMessage({ type: 'action', action }); }
  </script>
</body></html>`;
    }

    dispose(): void {
        this._disposed = true;
        DashboardPanel._panel = undefined;
        const toDispose = this._disposables.splice(0);
        toDispose.forEach((d) => d.dispose());
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
