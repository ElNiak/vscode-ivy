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
            await editor.document.save();
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
): Promise<void> {
    const target = await getTargetUri(resourceUri);
    if (!target) {
        return;
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

    const filePath = target.uri.replace("file://", "");

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

        const result = await client.sendRequest<IvyToolResult>(
            method,
            requestParams,
            activeCts.token
        );

        formatResult(channel, label, filePath, result);

        if (result.success) {
            vscode.window.showInformationMessage(`Ivy: ${label} passed`);
        } else {
            vscode.window.showWarningMessage(
                `Ivy: ${label} failed - see Output`
            );
        }
    } catch (err) {
        if (activeCts?.token.isCancellationRequested) {
            channel.appendLine("[Cancelled]");
        } else {
            const msg = err instanceof Error ? err.message : String(err);
            channel.appendLine(`[Error] ${msg}`);
            vscode.window.showErrorMessage(`Ivy: ${label} error - ${msg}`);
        }
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
    await runAction(client, "ivy/showModel", "Show Model", {}, resourceUri);
}
