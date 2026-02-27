/**
 * Browser-side entry point for the Model Visualization webview.
 *
 * Runs inside a VS Code webview panel (DOM available).
 * Receives data via window.addEventListener("message", ...).
 *
 * - Task 18: Cytoscape dependency graph + state machine tabs.
 * - Tasks 19-20 will add summary table and module layers rendering.
 */

import { createDependencyGraph, createStateMachineGraph } from "./graphRenderer";
import { Core } from "cytoscape";

declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

let depGraph: Core | null = null;
let smGraph: Core | null = null;

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

document.querySelectorAll(".tab-bar button").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll(".tab-bar button")
            .forEach((b) => b.classList.remove("active"));
        document
            .querySelectorAll(".tab-content")
            .forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        const tabId = (btn as HTMLElement).dataset.tab!;
        document.getElementById(tabId)!.classList.add("active");

        // Cytoscape needs a resize after the container becomes visible,
        // otherwise the canvas dimensions are zero.
        if (tabId === "dependencies" && depGraph) {
            depGraph.resize();
        }
        if (tabId === "state-machine" && smGraph) {
            smGraph.resize();
        }
    });
});

// ---------------------------------------------------------------------------
// Source navigation callback
// ---------------------------------------------------------------------------

function navigateToSource(id: string, file?: string, line?: number): void {
    if (file && line !== undefined) {
        vscode.postMessage({ type: "navigateToSource", file, line });
    }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
        case "updateDependencyGraph": {
            const container = document.getElementById("graph-container");
            if (container && msg.data) {
                if (depGraph) {
                    depGraph.destroy();
                }
                depGraph = createDependencyGraph(
                    container,
                    msg.data,
                    navigateToSource,
                );
            }
            break;
        }
        case "updateStateMachine": {
            const container = document.getElementById(
                "state-machine-container",
            );
            if (container && msg.data) {
                if (smGraph) {
                    smGraph.destroy();
                }
                smGraph = createStateMachineGraph(
                    container,
                    msg.data,
                    navigateToSource,
                );
            }
            break;
        }
        case "updateModelSummary":
            // Task 19 will handle summary table rendering.
            break;
        case "updateActionRequirements":
            // Task 20 will handle layers rendering.
            break;
        case "ping":
            vscode.postMessage({ type: "pong" });
            break;
    }
});

// Signal ready
vscode.postMessage({ type: "webviewReady" });
