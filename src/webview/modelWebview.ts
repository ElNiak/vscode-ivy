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
// Module layers rendering
// ---------------------------------------------------------------------------

function renderLayers(data: { actions: any[]; scopeInfo: any }): void {
    const container = document.getElementById("layers-container");
    if (!container) return;

    // Group actions by file
    const byFile = new Map<string, any[]>();
    for (const action of data.actions) {
        const file = action.file || "unknown";
        if (!byFile.has(file)) {
            byFile.set(file, []);
        }
        byFile.get(file)!.push(action);
    }

    container.innerHTML = "";

    for (const [file, actions] of byFile) {
        const section = document.createElement("details");
        section.open = true;

        const summary = document.createElement("summary");
        const shortFile = file.split("/").slice(-2).join("/");
        summary.textContent = `${shortFile} (${actions.length} actions)`;
        summary.style.cursor = "pointer";
        summary.style.padding = "4px 8px";
        summary.style.fontWeight = "bold";
        summary.style.borderBottom = "1px solid var(--vscode-panel-border)";
        section.appendChild(summary);

        const list = document.createElement("div");
        list.style.padding = "4px 16px";

        for (const action of actions) {
            const item = document.createElement("div");
            item.style.padding = "2px 0";
            item.style.display = "flex";
            item.style.justifyContent = "space-between";

            const nameLink = document.createElement("a");
            nameLink.href = "#";
            nameLink.textContent = action.actionName;
            nameLink.style.color = "var(--vscode-textLink-foreground)";
            nameLink.addEventListener("click", (e) => {
                e.preventDefault();
                navigateToSource(action.actionName, action.file, action.line);
            });

            const badge = document.createElement("span");
            const parts: string[] = [];
            if (action.direction) {
                parts.push(action.direction);
            }
            parts.push(`${action.counts.total} reqs`);
            if (action.rfcTags.length > 0) {
                parts.push(`${action.rfcTags.length} RFC`);
            }
            badge.textContent = parts.join(" | ");
            badge.style.fontSize = "11px";
            badge.style.opacity = "0.7";

            item.appendChild(nameLink);
            item.appendChild(badge);
            list.appendChild(item);
        }

        section.appendChild(list);
        container.appendChild(section);
    }

    // Scope info footer
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
            if (msg.data) {
                renderLayers(msg.data);
            }
            break;
        case "ping":
            vscode.postMessage({ type: "pong" });
            break;
    }
});

// Signal ready
vscode.postMessage({ type: "webviewReady" });
