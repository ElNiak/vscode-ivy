/**
 * Browser-side entry point for the Model Visualization webview.
 *
 * Runs inside a VS Code webview panel (DOM available).
 * Receives data via window.addEventListener("message", ...).
 *
 * - Task 18: Cytoscape dependency graph + state machine tabs.
 * - Task 19: summary table rendering.
 * - Task 20: module layers rendering with file grouping.
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
        const tabId = (btn as HTMLElement).dataset.tab;
        if (!tabId) return;
        const tabContent = document.getElementById(tabId);
        if (!tabContent) return;
        tabContent.classList.add("active");

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
    if (!Array.isArray(data?.rows)) return;

    const thead = table.querySelector("thead tr");
    const tbody = table.querySelector("tbody");
    if (!thead || !tbody) return;

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

        const tdAction = document.createElement("td");
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = String(row.actionName);
        link.dataset.file = String(row.file ?? "");
        link.dataset.line = String(row.line || 0);
        link.addEventListener("click", (e) => {
            e.preventDefault();
            if (link.dataset.file) {
                navigateToSource("", link.dataset.file, parseInt(link.dataset.line || "0", 10));
            }
        });
        tdAction.appendChild(link);
        tr.appendChild(tdAction);

        const cellValues = [
            row.direction || "-",
            row.beforeRequireCount,
            row.beforeEnsureCount,
            row.afterRequireCount,
            row.afterEnsureCount,
            row.assumeCount,
            row.assertCount,
        ];
        for (const val of cellValues) {
            const td = document.createElement("td");
            td.textContent = String(val);
            tr.appendChild(td);
        }

        const tdTotal = document.createElement("td");
        const strong = document.createElement("strong");
        strong.textContent = String(row.totalRequirements);
        tdTotal.appendChild(strong);
        tr.appendChild(tdTotal);

        const tdVars = document.createElement("td");
        tdVars.textContent = `${row.stateVarsRead}/${row.stateVarsWritten}`;
        tr.appendChild(tdVars);

        const tdRfc = document.createElement("td");
        tdRfc.textContent = String(row.rfcCoverageCount);
        tr.appendChild(tdRfc);

        tbody.appendChild(tr);
    }

    // Totals row
    if (data.totals) {
        const tr = document.createElement("tr");
        tr.style.fontWeight = "bold";

        const tdLabel = document.createElement("td");
        tdLabel.textContent = `Total (${data.totals.actions} actions)`;
        tr.appendChild(tdLabel);

        const tdDash = document.createElement("td");
        tdDash.textContent = "-";
        tr.appendChild(tdDash);

        const tdSpan = document.createElement("td");
        tdSpan.colSpan = 6;
        tr.appendChild(tdSpan);

        const tdReqs = document.createElement("td");
        tdReqs.textContent = String(data.totals.requirements);
        tr.appendChild(tdReqs);

        const tdVars = document.createElement("td");
        tdVars.textContent = String(data.totals.stateVars);
        tr.appendChild(tdVars);

        const tdCov = document.createElement("td");
        tdCov.textContent = `${data.totals.rfcTagsCovered}/${data.totals.rfcTagsTotal}`;
        tr.appendChild(tdCov);

        tbody.appendChild(tr);
    }
}

// ---------------------------------------------------------------------------
// Module layers rendering
// ---------------------------------------------------------------------------

interface LayerGroup {
    file: string | null;
    module: string | null;
    actions: string[];
    stateVars: string[];
    requirements: number;
}

function renderLayers(data: {
    layers: LayerGroup[];
    scopeInfo: { testFile: string | null; scoped: boolean };
}): void {
    const container = document.getElementById("layers-container");
    if (!container) return;
    if (!Array.isArray(data?.layers)) return;
    container.innerHTML = "";

    if (data.layers.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "16px";
        empty.style.opacity = "0.7";
        empty.textContent = "No module layers available.";
        container.appendChild(empty);
        return;
    }

    for (const layer of data.layers) {
        const section = document.createElement("details");
        section.open = true;

        const summary = document.createElement("summary");
        const label = layer.file
            ? layer.file.split("/").slice(-2).join("/")
            : layer.module || "unknown";
        summary.textContent = `${label} (${layer.actions.length} actions, ${layer.stateVars.length} state vars, ${layer.requirements} reqs)`;
        summary.style.cursor = "pointer";
        summary.style.padding = "4px 8px";
        summary.style.fontWeight = "bold";
        summary.style.borderBottom = "1px solid var(--vscode-panel-border)";
        section.appendChild(summary);

        const list = document.createElement("div");
        list.style.padding = "4px 16px";

        if (layer.actions.length > 0) {
            const actionsHeader = document.createElement("div");
            actionsHeader.style.fontSize = "11px";
            actionsHeader.style.opacity = "0.7";
            actionsHeader.style.padding = "4px 0 2px";
            actionsHeader.textContent = "Actions:";
            list.appendChild(actionsHeader);

            for (const actionName of layer.actions) {
                const item = document.createElement("div");
                item.style.padding = "1px 0 1px 8px";
                item.textContent = actionName;
                list.appendChild(item);
            }
        }

        if (layer.stateVars.length > 0) {
            const varsHeader = document.createElement("div");
            varsHeader.style.fontSize = "11px";
            varsHeader.style.opacity = "0.7";
            varsHeader.style.padding = "4px 0 2px";
            varsHeader.textContent = "State Variables:";
            list.appendChild(varsHeader);

            for (const varName of layer.stateVars) {
                const item = document.createElement("div");
                item.style.padding = "1px 0 1px 8px";
                item.textContent = varName;
                list.appendChild(item);
            }
        }

        section.appendChild(list);
        container.appendChild(section);
    }

    if (data.scopeInfo && data.scopeInfo.scoped) {
        const footer = document.createElement("div");
        footer.style.padding = "8px";
        footer.style.borderTop = "1px solid var(--vscode-panel-border)";
        footer.style.fontSize = "11px";
        footer.style.opacity = "0.7";
        footer.textContent = `Scoped to: ${data.scopeInfo.testFile || "active test"}`;
        container.appendChild(footer);
    }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

window.addEventListener("message", (event) => {
    try {
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
            case "updateLayeredOverview":
                if (msg.data) {
                    renderLayers(msg.data);
                }
                break;
            case "updateActionRequirements":
                // Rendered in the Requirements tree view, not this webview.
                console.debug("[ivy-webview] actionRequirements received (rendered in tree view)");
                break;
            case "updateCoverageGaps":
                // Rendered in the Requirements tree view, not this webview.
                console.debug("[ivy-webview] coverageGaps received (rendered in tree view)");
                break;
            case "ping":
                vscode.postMessage({ type: "pong" });
                break;
            default:
                console.warn("[ivy-webview] Unhandled message type:", msg.type);
                break;
        }
    } catch (err) {
        console.error("[ivy-webview] Error handling message:", err);
    }
});

// Signal ready
vscode.postMessage({ type: "webviewReady" });
