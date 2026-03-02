import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

// ---- Types ----

interface IvyToolResult {
    success: boolean;
    message: string;
    output: string[];
    duration: number;
    diagnosticCount?: number;
    isolate?: string;
    binaryPath?: string;
    availableIsolates?: string[];
}

// ---- Output Channel ----

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("Ivy");
    }
    return outputChannel;
}

// ---- Cancellation ----

let activeCts: vscode.CancellationTokenSource | undefined;

export function cancelCommand(): void {
    if (activeCts) {
        activeCts.cancel();
        activeCts.dispose();
        activeCts = undefined;
        getOutputChannel().appendLine("[Cancelled by user]");
    }
}

// ---- Helpers ----

/** Map LSP method to the corresponding timeout setting key and default value. */
function getTimeoutForMethod(method: string): { key: string; defaultSec: number } {
    if (method === "ivy/verify") {
        return { key: "tools.verifyTimeout", defaultSec: 120 };
    }
    // ivy/compile, ivy/showModel, and any future tool actions
    return { key: "tools.compileTimeout", defaultSec: 300 };
}

async function getTargetUri(
    resourceUri?: vscode.Uri
): Promise<{ uri: string; position?: vscode.Position } | undefined> {
    if (resourceUri) {
        return { uri: resourceUri.toString() };
    }
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === "ivy") {
        return {
            uri: editor.document.uri.toString(),
            position: editor.selection.active,
        };
    }
    vscode.window.showWarningMessage("No Ivy file is active.");
    return undefined;
}

async function autoSave(): Promise<void> {
    const config = vscode.workspace.getConfiguration("ivy");
    if (config.get<boolean>("tools.autoSaveBeforeAction", true)) {
        const editor = vscode.window.activeTextEditor;
        if (
            editor &&
            editor.document.isDirty &&
            editor.document.languageId === "ivy"
        ) {
            try {
                await editor.document.save();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn("[ivy-actions] autoSave failed:", err);
                vscode.window.showWarningMessage(
                    `Ivy: Could not save file before action \u2014 ${msg}`
                );
            }
        }
    }
}

function formatResult(
    channel: vscode.OutputChannel,
    label: string,
    filePath: string,
    result: IvyToolResult
): void {
    const icon = result.success ? "[PASS]" : "[FAIL]";
    channel.appendLine(`--- Ivy: ${label} ${filePath} ---`);
    channel.appendLine(`${icon} ${result.message}`);
    if (result.isolate) {
        channel.appendLine(`  Isolate: ${result.isolate}`);
    }
    channel.appendLine(`  Duration: ${result.duration.toFixed(1)}s`);
    if (result.diagnosticCount !== undefined && result.diagnosticCount > 0) {
        channel.appendLine(`  Diagnostics: ${result.diagnosticCount}`);
    }
    if (result.binaryPath) {
        channel.appendLine(`  Binary: ${result.binaryPath}`);
    }
    for (const line of result.output) {
        channel.appendLine(`  ${line}`);
    }
    channel.appendLine("");
}

async function runAction(
    client: LanguageClient,
    method: string,
    label: string,
    params: Record<string, unknown>,
    resourceUri?: vscode.Uri
): Promise<IvyToolResult | undefined> {
    const target = await getTargetUri(resourceUri);
    if (!target) {
        return undefined;
    }

    await autoSave();

    // Cancel previous operation
    if (activeCts) {
        activeCts.cancel();
        activeCts.dispose();
    }
    activeCts = new vscode.CancellationTokenSource();
    vscode.commands.executeCommand("setContext", "ivy.operationRunning", true);

    const channel = getOutputChannel();
    channel.show(true); // preserveFocus

    const filePath = vscode.Uri.parse(target.uri).fsPath;

    const { key, defaultSec } = getTimeoutForMethod(method);
    const timeoutSec = vscode.workspace
        .getConfiguration("ivy")
        .get<number>(key, defaultSec);
    const timeoutMs = timeoutSec * 1000;
    let timedOut = false;

    try {
        const requestParams: Record<string, unknown> = {
            textDocument: { uri: target.uri },
            workDoneToken: `ivy-${method}-${Date.now()}`,
            ...params,
        };
        if (target.position) {
            requestParams.position = {
                line: target.position.line,
                character: target.position.character,
            };
        }
        const request = client.sendRequest<IvyToolResult>(
            method,
            requestParams,
            activeCts.token
        );
        const timeout = new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
                timedOut = true;
                try { activeCts?.cancel(); } catch { /* already disposed */ }
                reject(new Error(`Timed out after ${timeoutSec}s`));
            }, timeoutMs);
            // Clean up timer if request finishes first.
            request.then(() => clearTimeout(timer), () => clearTimeout(timer));
        });

        const result = await Promise.race([request, timeout]);

        formatResult(channel, label, filePath, result);

        if (result.success) {
            vscode.window.showInformationMessage(`Ivy: ${label} passed`);
        } else if (!result.availableIsolates?.length) {
            vscode.window.showWarningMessage(
                `Ivy: ${label} failed - see Output`
            );
        }

        return result;
    } catch (err) {
        if (timedOut) {
            channel.appendLine(`[Timeout] Timed out after ${timeoutSec}s`);
            vscode.window.showWarningMessage(
                `Ivy: ${label} timed out after ${timeoutSec}s`
            );
        } else if (activeCts?.token.isCancellationRequested) {
            channel.appendLine("[Cancelled]");
        } else {
            const msg = err instanceof Error ? err.message : String(err);
            channel.appendLine(`[Error] ${msg}`);
            vscode.window.showErrorMessage(`Ivy: ${label} error - ${msg}`);
        }
        return undefined;
    } finally {
        vscode.commands.executeCommand(
            "setContext",
            "ivy.operationRunning",
            false
        );
        activeCts?.dispose();
        activeCts = undefined;
    }
}

// ---- Public Commands ----

export async function verifyCommand(
    client: LanguageClient,
    resourceUri?: vscode.Uri
): Promise<void> {
    await runAction(client, "ivy/verify", "Verify", {}, resourceUri);
}

export async function compileCommand(
    client: LanguageClient,
    resourceUri?: vscode.Uri
): Promise<void> {
    await runAction(
        client,
        "ivy/compile",
        "Compile",
        { target: "test" },
        resourceUri
    );
}

export async function showModelCommand(
    client: LanguageClient,
    resourceUri?: vscode.Uri
): Promise<void> {
    const result = await runAction(client, "ivy/showModel", "Show Model", {}, resourceUri);
    if (result && !result.success && result.availableIsolates?.length) {
        const pick = await vscode.window.showQuickPick(
            result.availableIsolates,
            { placeHolder: "Select isolate to show" }
        );
        if (pick) {
            await runAction(client, "ivy/showModel", "Show Model", { isolate: pick }, resourceUri);
        }
    }
}

export async function recompileAllCommand(
    client: LanguageClient
): Promise<void> {
    try {
        const result = await client.sendRequest<{
            success: boolean;
            message?: string;
            error?: string;
            testFileCount?: number;
        }>("ivy/recompileAll");

        if (result.success) {
            vscode.window.showInformationMessage(
                `Ivy: ${result.message ?? "Recompilation started"}`
            );
        } else {
            vscode.window.showWarningMessage(
                `Ivy: Recompile failed \u2014 ${result.error ?? "Unknown error"}`
            );
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Ivy: Recompile error \u2014 ${msg}`);
    }
}
