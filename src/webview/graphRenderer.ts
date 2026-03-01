/**
 * Cytoscape.js graph rendering helpers for the Model Visualization webview.
 *
 * Provides layout, styling, and interaction for the action dependency
 * graph and state machine tabs.  Reads VS Code CSS custom properties at
 * runtime so graphs follow the active colour theme.
 *
 * This file runs in a browser context (webview), NOT in Node.js.
 * It is bundled by esbuild.webview.js and excluded from tsconfig.json.
 */

import cytoscape, { Core, ElementDefinition, Stylesheet } from "cytoscape";

// ---------------------------------------------------------------------------
// Types mirroring requirementTypes.ts (we cannot import from the extension
// side because this bundle targets the browser; we duplicate the minimal
// shapes instead).
// ---------------------------------------------------------------------------

interface GraphNode {
    id: string;
    label: string;
    type: "action" | "stateVar";
    file?: string;
    line?: number;
    requirementCount?: number;
}

interface GraphEdge {
    source: string;
    target: string;
    label?: string;
    type: "reads" | "writes" | "shared_state";
}

interface DependencyGraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

interface StateMachineNode {
    id: string;
    label: string;
    type: "state" | "invariant";
    file?: string;
    line?: number;
}

interface StateMachineTransition {
    source: string;
    target: string;
    action: string;
    guards: string[];
}

interface StateMachineData {
    nodes: StateMachineNode[];
    transitions: StateMachineTransition[];
}

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

/** Read a VS Code CSS custom property as a string value. */
function getCssVar(name: string): string {
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue(name).trim() || "#888";
}

function getThemeColors() {
    return {
        fg: getCssVar("--vscode-foreground"),
        bg: getCssVar("--vscode-editor-background"),
        accent: getCssVar("--vscode-textLink-foreground"),
        border: getCssVar("--vscode-panel-border"),
        green: getCssVar("--vscode-charts-green") || "#4caf50",
        yellow: getCssVar("--vscode-charts-yellow") || "#ffb300",
        blue: getCssVar("--vscode-charts-blue") || "#2196f3",
    };
}

// ---------------------------------------------------------------------------
// Action Dependency Graph
// ---------------------------------------------------------------------------

/**
 * Render an action dependency graph inside `container`.
 *
 * - Action nodes: rounded rectangle, sized proportionally to requirement count.
 * - State var nodes: diamond, smaller, distinct colour.
 * - Edges: directed arrows; `shared_state` edges are dashed and coloured.
 * - Layout: `cose` (force-directed) for organic placement.
 *
 * Returns the Cytoscape `Core` instance so callers can destroy/resize it.
 */
export function createDependencyGraph(
    container: HTMLElement,
    data: DependencyGraphData,
    onNodeClick?: (id: string, file?: string, line?: number) => void,
): Core {
    const colors = getThemeColors();

    const elements: ElementDefinition[] = [];

    for (const node of data.nodes) {
        elements.push({
            data: {
                id: node.id,
                label: node.label,
                type: node.type,
                file: node.file,
                line: node.line,
                reqCount: node.requirementCount || 0,
            },
        });
    }

    for (const edge of data.edges) {
        elements.push({
            data: {
                source: edge.source,
                target: edge.target,
                label: edge.label || "",
                type: edge.type,
            },
        });
    }

    const style: Stylesheet[] = [
        {
            selector: "node[type='action']",
            style: {
                label: "data(label)",
                "background-color": colors.blue,
                shape: "roundrectangle",
                color: colors.fg,
                "text-valign": "bottom",
                "text-margin-y": 5,
                "font-size": 11,
                width: "mapData(reqCount, 0, 20, 30, 60)",
                height: "mapData(reqCount, 0, 20, 30, 60)",
            },
        },
        {
            selector: "node[type='stateVar']",
            style: {
                label: "data(label)",
                "background-color": colors.green,
                shape: "diamond",
                color: colors.fg,
                "text-valign": "bottom",
                "text-margin-y": 5,
                "font-size": 10,
                width: 25,
                height: 25,
            },
        },
        {
            selector: "edge",
            style: {
                width: 2,
                "line-color": colors.border,
                "target-arrow-color": colors.border,
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
                label: "data(label)",
                "font-size": 9,
                color: colors.fg,
                "text-rotation": "autorotate",
            },
        },
        {
            selector: "edge[type='shared_state']",
            style: {
                "line-color": colors.yellow,
                "target-arrow-color": colors.yellow,
                "line-style": "dashed",
            },
        },
    ];

    const cy = cytoscape({
        container,
        elements,
        style,
        layout: {
            name: "cose",
            animate: false,
            nodeOverlap: 20,
            idealEdgeLength: 100,
        },
    });

    if (onNodeClick) {
        cy.on("tap", "node", (evt) => {
            const node = evt.target;
            onNodeClick(node.id(), node.data("file"), node.data("line"));
        });
    }

    return cy;
}

// ---------------------------------------------------------------------------
// State Machine Graph
// ---------------------------------------------------------------------------

/**
 * Render a state machine view inside `container`.
 *
 * - State nodes: rounded rectangle.
 * - Invariant nodes: octagon, distinct colour.
 * - Transitions: directed edges labelled with the action name.
 * - Layout: `cose` (force-directed).
 *
 * Returns the Cytoscape `Core` instance so callers can destroy/resize it.
 */
export function createStateMachineGraph(
    container: HTMLElement,
    data: StateMachineData,
    onNodeClick?: (id: string, file?: string, line?: number) => void,
): Core {
    const colors = getThemeColors();

    const elements: ElementDefinition[] = [];

    for (const node of data.nodes) {
        elements.push({
            data: {
                id: node.id,
                label: node.label,
                type: node.type,
                file: node.file,
                line: node.line,
            },
        });
    }

    for (let i = 0; i < data.transitions.length; i++) {
        const t = data.transitions[i];
        elements.push({
            data: {
                id: `t${i}`,
                source: t.source,
                target: t.target,
                label: t.action,
            },
        });
    }

    const style: Stylesheet[] = [
        {
            selector: "node[type='state']",
            style: {
                label: "data(label)",
                "background-color": colors.blue,
                shape: "roundrectangle",
                color: colors.fg,
                "text-valign": "center",
                "text-halign": "center",
                "font-size": 11,
                width: 80,
                height: 30,
            },
        },
        {
            selector: "node[type='invariant']",
            style: {
                label: "data(label)",
                "background-color": colors.yellow,
                shape: "octagon",
                color: colors.fg,
                "text-valign": "center",
                "font-size": 9,
                width: 60,
                height: 25,
            },
        },
        {
            selector: "edge",
            style: {
                width: 2,
                "line-color": colors.border,
                "target-arrow-color": colors.accent,
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
                label: "data(label)",
                "font-size": 9,
                color: colors.fg,
                "text-rotation": "autorotate",
            },
        },
    ];

    const cy = cytoscape({
        container,
        elements,
        style,
        layout: {
            name: "cose",
            animate: false,
            nodeOverlap: 20,
        },
    });

    if (onNodeClick) {
        cy.on("tap", "node", (evt) => {
            const node = evt.target;
            onNodeClick(node.id(), node.data("file"), node.data("line"));
        });
    }

    return cy;
}
