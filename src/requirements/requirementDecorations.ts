/**
 * Editor decorations for requirement density / coverage indicators.
 *
 * Shows gutter-area symbols on lines where Ivy actions are defined,
 * colored by requirement density.  Driven by ModelDataProvider data.
 *
 * - High coverage (>=2 total requirements): green filled circle
 * - Low coverage  (<2 total requirements):  yellow empty circle
 */

import * as vscode from "vscode";
import { ModelDataProvider } from "../modelDataProvider";

// ---------------------------------------------------------------------------
// Decoration types (created once, reused across calls)
// ---------------------------------------------------------------------------

const highCoverageType = vscode.window.createTextEditorDecorationType({
    gutterIconSize: "contain",
    overviewRulerColor: new vscode.ThemeColor("charts.green"),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    light: {
        before: {
            contentText: "\u25CF", // Filled circle
            color: new vscode.ThemeColor("charts.green"),
        },
    },
    dark: {
        before: {
            contentText: "\u25CF",
            color: new vscode.ThemeColor("charts.green"),
        },
    },
});

const lowCoverageType = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: new vscode.ThemeColor("charts.yellow"),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
    light: {
        before: {
            contentText: "\u25CB", // Empty circle
            color: new vscode.ThemeColor("charts.yellow"),
        },
    },
    dark: {
        before: {
            contentText: "\u25CB",
            color: new vscode.ThemeColor("charts.yellow"),
        },
    },
});

/** Disposables for the decoration types — push into context.subscriptions. */
export const requirementDecorationTypes: vscode.Disposable[] = [
    highCoverageType,
    lowCoverageType,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply requirement-density decorations to an editor based on the current
 * model data.  Only decorates lines in the editor's file that correspond
 * to action definitions.
 *
 * If `actionName` is provided, only that action's line is decorated;
 * otherwise all actions in the file are decorated.
 */
export function applyRequirementDecorations(
    editor: vscode.TextEditor,
    provider: ModelDataProvider,
    actionName?: string,
): void {
    const data = provider.actionRequirements;
    if (!data || !data.modelReady || !Array.isArray(data.actions)) {
        clearRequirementDecorations(editor);
        return;
    }

    const filePath = editor.document.uri.fsPath;
    const highRanges: vscode.DecorationOptions[] = [];
    const lowRanges: vscode.DecorationOptions[] = [];

    for (const action of data.actions) {
        // Filter by file -- only decorate actions defined in this editor.
        if (action.file.toLowerCase() !== filePath.toLowerCase()) {
            continue;
        }
        // If a specific action was requested, skip non-matching ones.
        if (actionName && action.actionName !== actionName) {
            continue;
        }
        const line = action.line;
        if (line < 0 || line >= editor.document.lineCount) {
            continue;
        }
        const range = new vscode.Range(line, 0, line, 0);
        const hoverMessage = `${action.actionName}: ${action.counts.total} requirements`;

        if (action.counts.total >= 2) {
            highRanges.push({ range, hoverMessage });
        } else {
            lowRanges.push({ range, hoverMessage });
        }
    }

    editor.setDecorations(highCoverageType, highRanges);
    editor.setDecorations(lowCoverageType, lowRanges);
}

/**
 * Remove all requirement decorations from the given editor.
 */
export function clearRequirementDecorations(
    editor: vscode.TextEditor,
): void {
    editor.setDecorations(highCoverageType, []);
    editor.setDecorations(lowCoverageType, []);
}
