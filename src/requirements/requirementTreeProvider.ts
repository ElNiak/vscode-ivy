/**
 * Tree data provider for the Requirements sidebar view.
 *
 * Tree structure:
 *   Requirements
 *     +-- send_pkt (ActionItem)        -- collapsible
 *     |   +-- Before (MonitorGroupItem) -- collapsible
 *     |   |   +-- require: conn_state(C) = open [rfc9000:4.1] (RequirementItem) -- leaf
 *     |   +-- After (MonitorGroupItem)  -- collapsible
 *     |       +-- ensure: sent(C, P) = true (RequirementItem) -- leaf
 *     +-- recv_pkt (ActionItem)
 *         +-- (no monitors) (MessageItem)
 */

import * as vscode from "vscode";
import { ModelDataProvider } from "../modelDataProvider";
import { ActionBoundary, RequirementDetail } from "./requirementTypes";

/** Union of all tree item types used in this provider. */
type ReqTreeItem = ActionItem | MonitorGroupItem | RequirementItem | MessageItem;

export class RequirementTreeProvider
    implements vscode.TreeDataProvider<ReqTreeItem>, vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<
        ReqTreeItem | undefined | null | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _disposable: vscode.Disposable;

    constructor(private readonly provider: ModelDataProvider) {
        this._disposable = provider.onDidChange(() =>
            this._onDidChangeTreeData.fire()
        );
    }

    getTreeItem(element: ReqTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ReqTreeItem): ReqTreeItem[] {
        if (!element) {
            return this._getRootItems();
        }
        if (element instanceof ActionItem) {
            return this._getMonitorGroups(element.action);
        }
        if (element instanceof MonitorGroupItem) {
            return this._getRequirements(element.requirements);
        }
        return [];
    }

    private _getRootItems(): ReqTreeItem[] {
        const data = this.provider.actionRequirements;
        if (!data) {
            return [new MessageItem("Waiting for server...")];
        }
        if (!data.modelReady) {
            return [new MessageItem("Indexing workspace...")];
        }
        if (!Array.isArray(data.actions) || data.actions.length === 0) {
            return [new MessageItem("No actions found")];
        }
        return data.actions.map((a) => new ActionItem(a));
    }

    private _getMonitorGroups(action: ActionBoundary): ReqTreeItem[] {
        const monitors = action.monitors;
        if (!monitors) {
            return [new MessageItem("No monitors")];
        }

        const groups: ReqTreeItem[] = [];
        if (monitors.before?.length > 0) {
            groups.push(
                new MonitorGroupItem(
                    "Before",
                    monitors.before,
                    vscode.TreeItemCollapsibleState.Expanded
                )
            );
        }
        if (monitors.after?.length > 0) {
            groups.push(
                new MonitorGroupItem(
                    "After",
                    monitors.after,
                    vscode.TreeItemCollapsibleState.Expanded
                )
            );
        }
        if (monitors.direct?.length > 0) {
            groups.push(
                new MonitorGroupItem(
                    "Direct",
                    monitors.direct,
                    vscode.TreeItemCollapsibleState.Collapsed
                )
            );
        }
        if (groups.length === 0) {
            groups.push(new MessageItem("No monitors"));
        }
        return groups;
    }

    private _getRequirements(reqs: RequirementDetail[]): ReqTreeItem[] {
        return reqs.map((r) => new RequirementItem(r));
    }

    dispose(): void {
        this._disposable.dispose();
        this._onDidChangeTreeData.dispose();
    }
}

// ---------------------------------------------------------------------------
// TreeItem subclasses
// ---------------------------------------------------------------------------

/** Collapsible item representing a single Ivy action. */
class ActionItem extends vscode.TreeItem {
    constructor(public readonly action: ActionBoundary) {
        super(action.actionName, vscode.TreeItemCollapsibleState.Collapsed);

        const parts: string[] = [];
        if (action.counts.total > 0) {
            parts.push(`${action.counts.total} reqs`);
        }
        if (action.rfcTags.length > 0) {
            parts.push(`${action.rfcTags.length} RFC tags`);
        }
        if (action.direction) {
            parts.push(action.direction);
        }
        this.description = parts.join(" | ");
        this.tooltip = action.qualifiedName;
        this.iconPath = new vscode.ThemeIcon(directionIcon(action.direction));
        this.contextValue = "action";

        // Click to navigate to action definition.
        if (action.file && action.line >= 0) {
            this.command = {
                title: "Go to Action",
                command: "vscode.open",
                arguments: [
                    vscode.Uri.file(action.file),
                    {
                        selection: new vscode.Range(
                            action.line,
                            0,
                            action.line,
                            0
                        ),
                    },
                ],
            };
        }
    }
}

/** Collapsible group for "Before", "After", or "Direct" monitors. */
class MonitorGroupItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly requirements: RequirementDetail[],
        state: vscode.TreeItemCollapsibleState
    ) {
        super(label, state);
        this.description = `${requirements.length}`;
        this.iconPath = new vscode.ThemeIcon(
            label === "Before"
                ? "arrow-up"
                : label === "After"
                  ? "arrow-down"
                  : "arrow-right"
        );
        this.contextValue = "monitorGroup";
    }
}

/** Leaf item for a single requirement (require / ensure / assume / assert). */
class RequirementItem extends vscode.TreeItem {
    constructor(req: RequirementDetail) {
        super(
            `${req.kind}: ${req.formulaText}`,
            vscode.TreeItemCollapsibleState.None
        );

        const parts: string[] = [];
        if (req.bracketTags.length > 0) {
            parts.push(req.bracketTags.join(", "));
        }
        if (req.nctClassification) {
            parts.push(`[${req.nctClassification}]`);
        }
        if (req.stateVarsRead.length > 0) {
            parts.push(`reads: ${req.stateVarsRead.join(", ")}`);
        }
        this.description = parts.join(" | ");
        this.tooltip = `${req.kind} at ${req.file}:${req.line}\n${req.formulaText}`;
        this.iconPath = new vscode.ThemeIcon(requirementKindIcon(req.kind));
        this.contextValue = "requirement";

        // Click to navigate to requirement source location.
        if (req.file && req.line >= 0) {
            this.command = {
                title: "Go to Requirement",
                command: "vscode.open",
                arguments: [
                    vscode.Uri.file(req.file),
                    {
                        selection: new vscode.Range(
                            req.line,
                            0,
                            req.line,
                            0
                        ),
                    },
                ],
            };
        }
    }
}

/** Leaf placeholder item for "Model not ready", "No actions", etc. */
class MessageItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon("info");
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map action direction to a ThemeIcon identifier. */
function directionIcon(
    direction: "GENERATED" | "RECEIVED" | "INTERNAL" | null
): string {
    switch (direction) {
        case "GENERATED":
            return "arrow-up";
        case "RECEIVED":
            return "arrow-down";
        case "INTERNAL":
            return "symbol-event";
        default:
            return "symbol-event";
    }
}

/** Map requirement kind to a ThemeIcon identifier. */
function requirementKindIcon(kind: string): string {
    switch (kind) {
        case "require":
            return "shield";
        case "ensure":
            return "check";
        case "assume":
            return "eye";
        case "assert":
            return "warning";
        default:
            return "question";
    }
}
