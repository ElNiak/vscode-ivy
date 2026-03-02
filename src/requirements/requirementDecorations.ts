/**
 * Editor decorations for requirement density / coverage indicators.
 *
 * Shows inline symbols on lines where Ivy actions are defined,
 * colored by requirement density.  Driven by ModelDataProvider data.
 *
 * - High coverage (>= threshold total requirements): green filled circle
 * - Low coverage  (<  threshold total requirements): yellow empty circle
 *
 * The threshold defaults to 2 and can be configured via the
 * `ivy.requirements.coverageThreshold` VS Code setting.
 */

import * as vscode from "vscode";
import { ModelDataProvider } from "../modelDataProvider";

/** Minimum total requirements per action for the green (high) coverage indicator. */
const DEFAULT_COVERAGE_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Decoration types (lazily created on first use)
// ---------------------------------------------------------------------------

let _highCoverageType: vscode.TextEditorDecorationType | undefined;
let _lowCoverageType: vscode.TextEditorDecorationType | undefined;

function getHighCoverageType(): vscode.TextEditorDecorationType {
    if (!_highCoverageType) {
        _highCoverageType = vscode.window.createTextEditorDecorationType({
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
    }
    return _highCoverageType;
}

function getLowCoverageType(): vscode.TextEditorDecorationType {
    if (!_lowCoverageType) {
        _lowCoverageType = vscode.window.createTextEditorDecorationType({
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
    }
    return _lowCoverageType;
}

/** Disposables for the decoration types — push into context.subscriptions. */
export const requirementDecorationTypes: vscode.Disposable[] = [
    { dispose() { _highCoverageType?.dispose(); _highCoverageType = undefined; } },
    { dispose() { _lowCoverageType?.dispose(); _lowCoverageType = undefined; } },
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

    const threshold = vscode.workspace
        .getConfiguration("ivy")
        .get<number>("requirements.coverageThreshold", DEFAULT_COVERAGE_THRESHOLD);

    for (const action of data.actions) {
        // Filter by file -- only decorate actions defined in this editor.
        // Use VS Code's URI normalization for platform-aware comparison.
        if (vscode.Uri.file(action.file).fsPath !== filePath) {
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

        if (action.counts.total >= threshold) {
            highRanges.push({ range, hoverMessage });
        } else {
            lowRanges.push({ range, hoverMessage });
        }
    }

    editor.setDecorations(getHighCoverageType(), highRanges);
    editor.setDecorations(getLowCoverageType(), lowRanges);
}

/**
 * Remove all requirement decorations from the given editor.
 */
export function clearRequirementDecorations(
    editor: vscode.TextEditor,
): void {
    editor.setDecorations(getHighCoverageType(), []);
    editor.setDecorations(getLowCoverageType(), []);
}
