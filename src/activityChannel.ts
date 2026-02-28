import * as vscode from "vscode";

interface ParsedLogLine {
    category: string | null;  // "MIL", "ACT", "DIA", "PER"
    phase: string | null;     // "indexing", "deep_index", etc.
    humanMessage: string;     // The readable part
    payload: Record<string, unknown> | null;  // Optional JSON
    raw: string;
}

export class ActivityChannel implements vscode.Disposable {
    private channel: vscode.LogOutputChannel;
    private enabledCategories: Set<string>;
    private granularity: "phase" | "file";
    private enabled: boolean;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.channel = vscode.window.createOutputChannel("Ivy Activity", { log: true });
        this.enabled = true;
        this.enabledCategories = new Set();
        this.granularity = "phase";
        this.loadSettings();

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (
                    e.affectsConfiguration("ivy.activity.enabled") ||
                    e.affectsConfiguration("ivy.activity.categories") ||
                    e.affectsConfiguration("ivy.activity.granularity")
                ) {
                    this.loadSettings();
                }
            })
        );
    }

    handleLogMessage(type: number, message: string): void {
        if (!this.enabled) return;
        const parsed = this.parse(message);
        if (!parsed.category) return;  // Untagged -> skip (goes to standard channel)
        if (!this.shouldShow(parsed)) return;
        this.emit(type, parsed);
    }

    show(): void {
        this.channel.show(true);
    }

    private loadSettings(): void {
        const config = vscode.workspace.getConfiguration("ivy");
        this.enabled = config.get<boolean>("activity.enabled", true);
        const cats = config.get<string[]>("activity.categories", ["MIL", "DIA", "PER"]);
        this.enabledCategories = new Set(cats);
        this.granularity = config.get<string>("activity.granularity", "phase") as "phase" | "file";
    }

    private parse(raw: string): ParsedLogLine {
        // Match: [CAT:phase] message | {json}  or  [CAT:phase] message  or  [CAT] message
        const tagMatch = raw.match(/^\[(\w{3})(?::(\w+))?\]\s+(.*)/);
        if (!tagMatch) {
            return { category: null, phase: null, humanMessage: raw, payload: null, raw };
        }
        const [, cat, phase, rest] = tagMatch;
        const pipeIdx = rest.lastIndexOf(" | {");
        let humanMessage: string;
        let payload: Record<string, unknown> | null = null;
        if (pipeIdx >= 0) {
            humanMessage = rest.substring(0, pipeIdx);
            try {
                payload = JSON.parse(rest.substring(pipeIdx + 3));
            } catch {
                humanMessage = rest;
            }
        } else {
            humanMessage = rest;
        }
        return { category: cat, phase: phase ?? null, humanMessage, payload, raw };
    }

    private shouldShow(entry: ParsedLogLine): boolean {
        if (!this.enabledCategories.has(entry.category!)) return false;
        // In "phase" granularity, suppress ACT messages (they're per-file detail)
        if (this.granularity === "phase" && entry.category === "ACT") return false;
        return true;
    }

    private emit(_type: number, entry: ParsedLogLine): void {
        const phase = entry.phase ? `[${entry.phase}]` : "";
        const line = `${entry.category} ${phase} ${entry.humanMessage}`;
        // Route to appropriate severity in LogOutputChannel
        if (entry.category === "DIA") {
            this.channel.warn(line);
        } else if (entry.category === "PER") {
            this.channel.debug(line);
        } else if (entry.category === "ACT") {
            this.channel.trace(line);
        } else {
            this.channel.info(line);  // MIL
        }
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.channel.dispose();
    }
}
