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
// Summary table rendering
// ---------------------------------------------------------------------------

function renderSummaryTable(data: {
    rows: any[];
    totals: any;
}): void {
    const table = document.getElementById("summary-table");
    if (!table) return;

    const thead = table.querySelector("thead tr")!;
    const tbody = table.querySelector("tbody")!;

    thead.innerHTML = `
        <th>Action</th>
        <th>Direction</th>
        <th>Before (req)</th>
        <th>Before (ens)</th>
        <th>After (req)</th>
        <th>After (ens)</th>
        <th>Assume</th>
        <th>Assert</th>
        <th>Total</th>
        <th>Vars R/W</th>
        <th>RFC Tags</th>
    `;

    tbody.innerHTML = "";
    for (const row of data.rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><a href="#" data-file="${row.file}" data-line="${row.line || 0}">${row.actionName}</a></td>
            <td>${row.direction || "-"}</td>
            <td>${row.beforeRequireCount}</td>
            <td>${row.beforeEnsureCount}</td>
            <td>${row.afterRequireCount}</td>
            <td>${row.afterEnsureCount}</td>
            <td>${row.assumeCount}</td>
            <td>${row.assertCount}</td>
            <td><strong>${row.totalRequirements}</strong></td>
            <td>${row.stateVarsRead}/${row.stateVarsWritten}</td>
            <td>${row.rfcCoverageCount}</td>
        `;
        tbody.appendChild(tr);
    }

    // Totals row
    if (data.totals) {
        const tr = document.createElement("tr");
        tr.style.fontWeight = "bold";
        tr.innerHTML = `
            <td>Total (${data.totals.actions} actions)</td>
            <td>-</td>
            <td colspan="6"></td>
            <td>${data.totals.requirements}</td>
            <td>${data.totals.stateVars}</td>
            <td>${data.totals.rfcTagsCovered}/${data.totals.rfcTagsTotal}</td>
        `;
        tbody.appendChild(tr);
    }

    // Click handler for action names
    tbody.querySelectorAll("a[data-file]").forEach((a) => {
        a.addEventListener("click", (e) => {
            e.preventDefault();
            const file = (a as HTMLElement).dataset.file;
            const line = parseInt(
                (a as HTMLElement).dataset.line || "0",
                10,
            );
            if (file) {
                navigateToSource("", file, line);
            }
        });
    });
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
            if (msg.data) {
                renderSummaryTable(msg.data);
            }
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
