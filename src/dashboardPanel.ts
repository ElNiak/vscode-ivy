/** Webview dashboard panel for Ivy LSP monitoring. */

import * as vscode from "vscode";
import { LspStateTracker } from "./lspStateTracker";

export class DashboardPanel {
    private static _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];

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
        panel.onDidDispose(() => {
            DashboardPanel._panel = undefined;
            instance.dispose();
        });
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
        this.panel.webview.html = this._getHtml();
    }

    private async _handleMessage(msg: {
        type: string;
        action?: string;
    }): Promise<void> {
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
    }

    private _getHtml(): string {
        const s = this.tracker.serverStatus;
        const stats = this.tracker.indexerStats;
        const history = this.tracker.operationHistory;

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

        return `<!DOCTYPE html>
<html><head>
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

  <script>
    const vscode = acquireVsCodeApi();
    function send(action) { vscode.postMessage({ type: 'action', action }); }
  </script>
</body></html>`;
    }

    dispose(): void {
        this._disposables.forEach((d) => d.dispose());
    }
}

function formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${Math.floor(seconds)}s`;
    }
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    }
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
