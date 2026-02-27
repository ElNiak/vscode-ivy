/**
 * Browser-side entry point for the Model Visualization webview.
 *
 * Runs inside a VS Code webview panel (DOM available).
 * Receives data via window.addEventListener("message", ...).
 * Phase 7 (Tasks 18-20) will add Cytoscape tabs.
 */

declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
        case "updateActionRequirements":
        case "updateDependencyGraph":
        case "updateStateMachine":
        case "updateModelSummary":
            // Phase 7 will handle these.
            break;
        case "ping":
            vscode.postMessage({ type: "pong" });
            break;
    }
});

// Signal ready
vscode.postMessage({ type: "webviewReady" });
