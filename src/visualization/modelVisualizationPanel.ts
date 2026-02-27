/**
 * Singleton webview panel for model visualization.
 *
 * Follows the DashboardPanel pattern: single instance, preserves state
 * across hide/show, subscribes to ModelDataProvider changes.
 */

import * as vscode from "vscode";
import { ModelDataProvider } from "../modelDataProvider";

export class ModelVisualizationPanel {
    private static _instance: ModelVisualizationPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        provider: ModelDataProvider,
    ) {
        this._panel = panel;

        // Set webview HTML
        this._panel.webview.html = this._getHtml(
            panel.webview,
            extensionUri,
        );

        // Listen for data changes
        this._disposables.push(
            provider.onDidChange(() => this._sendData(provider)),
        );

        // Listen for webview messages
        this._panel.webview.onDidReceiveMessage(
            (msg) => {
                switch (msg.type) {
                    case "webviewReady":
                        this._sendData(provider);
                        provider.refreshGraphs();
                        break;
                    case "requestRefresh":
                        provider.refreshNow();
                        provider.refreshGraphs();
                        break;
                    case "navigateToSource":
                        if (msg.file && msg.line !== undefined) {
                            const uri = vscode.Uri.file(msg.file);
                            vscode.window.showTextDocument(uri, {
                                selection: new vscode.Range(
                                    msg.line,
                                    0,
                                    msg.line,
                                    0,
                                ),
                            });
                        }
                        break;
                }
            },
            undefined,
            this._disposables,
        );

        // Track visibility for polling
        this._panel.onDidChangeViewState(
            (e) => provider.setVisible(e.webviewPanel.visible),
            undefined,
            this._disposables,
        );

        // Cleanup on dispose
        this._panel.onDidDispose(
            () => {
                ModelVisualizationPanel._instance = undefined;
                provider.setVisible(false);
                for (const d of this._disposables) {
                    d.dispose();
                }
            },
            undefined,
            [],
        );
    }

    static show(
        context: vscode.ExtensionContext,
        provider: ModelDataProvider,
    ): void {
        if (ModelVisualizationPanel._instance) {
            ModelVisualizationPanel._instance._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "ivyModelVisualization",
            "Ivy Model Visualization",
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, "out"),
                ],
            },
        );

        ModelVisualizationPanel._instance = new ModelVisualizationPanel(
            panel,
            context.extensionUri,
            provider,
        );

        provider.setVisible(true);
    }

    private _sendData(provider: ModelDataProvider): void {
        const webview = this._panel.webview;
        if (provider.actionRequirements) {
            webview.postMessage({
                type: "updateActionRequirements",
                data: provider.actionRequirements,
            });
        }
        if (provider.modelSummary) {
            webview.postMessage({
                type: "updateModelSummary",
                data: provider.modelSummary,
            });
        }
        if (provider.dependencyGraph) {
            webview.postMessage({
                type: "updateDependencyGraph",
                data: provider.dependencyGraph,
            });
        }
        if (provider.stateMachine) {
            webview.postMessage({
                type: "updateStateMachine",
                data: provider.stateMachine,
            });
        }
        if (provider.coverageGaps) {
            webview.postMessage({
                type: "updateCoverageGaps",
                data: provider.coverageGaps,
            });
        }
    }

    private _getHtml(
        webview: vscode.Webview,
        extensionUri: vscode.Uri,
    ): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "out", "webview", "model.js"),
        );

        const nonce = _getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <title>Ivy Model Visualization</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .tab-bar {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }
        .tab-bar button {
            padding: 8px 16px;
            border: none;
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
        }
        .tab-bar button.active {
            border-bottom: 2px solid var(--vscode-focusBorder);
            color: var(--vscode-textLink-foreground);
        }
        .tab-content {
            display: none;
            height: calc(100vh - 40px);
            overflow: auto;
        }
        .tab-content.active {
            display: block;
        }
        #graph-container, #state-machine-container {
            width: 100%;
            height: 100%;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th, td {
            padding: 4px 8px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        th {
            background: var(--vscode-sideBar-background);
            position: sticky;
            top: 0;
        }
    </style>
</head>
<body>
    <div class="tab-bar">
        <button class="active" data-tab="dependencies">Action Dependencies</button>
        <button data-tab="state-machine">State Machine</button>
        <button data-tab="summary">Summary Table</button>
        <button data-tab="layers">Module Layers</button>
    </div>
    <div id="dependencies" class="tab-content active">
        <div id="graph-container"></div>
    </div>
    <div id="state-machine" class="tab-content">
        <div id="state-machine-container"></div>
    </div>
    <div id="summary" class="tab-content">
        <table id="summary-table"><thead><tr></tr></thead><tbody></tbody></table>
    </div>
    <div id="layers" class="tab-content">
        <div id="layers-container"></div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function _getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
