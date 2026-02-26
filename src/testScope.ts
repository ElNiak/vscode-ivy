import * as path from "path";
import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

// ---- Types ----

interface TestInfo {
    testFile: string;
    testerRole: string;
    exportCount: number;
    importCount: number;
    includeCount: number;
}

interface ListTestsResponse {
    tests: TestInfo[];
    activeTest: string | null;
}

interface SetActiveTestResponse {
    success: boolean;
    activeTest: string | null;
    error?: string;
}

// ---- Status Bar ----

export function createTestScopeStatusBar(
    context: vscode.ExtensionContext
): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        99
    );
    item.command = "ivy.setActiveTest";
    updateStatusBar(item, null);
    item.show();
    context.subscriptions.push(item);
    return item;
}

export function updateStatusBar(
    statusBar: vscode.StatusBarItem,
    testName: string | null
): void {
    if (testName) {
        const basename = path.basename(testName, ".ivy");
        statusBar.text = `$(beaker) ${basename}`;
        statusBar.tooltip = `Active test scope: ${testName}`;
    } else {
        statusBar.text = "$(beaker) No test scope";
        statusBar.tooltip = "Click to select an active test scope";
    }
}

// ---- Set Active Test (Quick Pick) ----

export async function setActiveTestCommand(
    client: LanguageClient
): Promise<void> {
    let response: ListTestsResponse;
    try {
        response = await client.sendRequest<ListTestsResponse>("ivy/listTests");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showWarningMessage(`Ivy: Failed to list tests - ${msg}`);
        return;
    }

    if (response.tests.length === 0) {
        vscode.window.showInformationMessage(
            "Ivy: No test scopes found in the workspace."
        );
        return;
    }

    interface TestQuickPickItem extends vscode.QuickPickItem {
        testFile: string | null;
    }

    const items: TestQuickPickItem[] = [
        {
            label: "$(close) Clear test scope",
            description: "Remove active test scope (show workspace-wide view)",
            testFile: null,
        },
    ];

    for (const test of response.tests) {
        const basename = path.basename(test.testFile, ".ivy");
        const isActive = test.testFile === response.activeTest;
        items.push({
            label: `${isActive ? "$(check) " : ""}${basename}`,
            description: `role: ${test.testerRole} | ${test.exportCount} exports | ${test.importCount} imports | ${test.includeCount} includes`,
            detail: test.testFile,
            testFile: test.testFile,
        });
    }

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select the active test scope",
        title: "Ivy: Set Active Test",
    });

    if (selected === undefined) {
        return; // User cancelled
    }

    try {
        const result = await client.sendRequest<SetActiveTestResponse>(
            "ivy/setActiveTest",
            { testFile: selected.testFile }
        );
        if (!result.success) {
            vscode.window.showWarningMessage(
                `Ivy: ${result.error ?? "Failed to set active test"}`
            );
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showWarningMessage(
            `Ivy: Failed to set active test - ${msg}`
        );
    }
}

// ---- List Tests ----

let testsChannel: vscode.OutputChannel | undefined;

export async function listTestsCommand(
    client: LanguageClient
): Promise<void> {
    let response: ListTestsResponse;
    try {
        response = await client.sendRequest<ListTestsResponse>("ivy/listTests");
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showWarningMessage(`Ivy: Failed to list tests - ${msg}`);
        return;
    }

    if (response.tests.length === 0) {
        vscode.window.showInformationMessage(
            "Ivy: No test scopes found in the workspace."
        );
        return;
    }

    if (!testsChannel) {
        testsChannel = vscode.window.createOutputChannel("Ivy Tests");
    }
    const channel = testsChannel;
    channel.clear();
    channel.appendLine(`Active test: ${response.activeTest ?? "(none)"}`);
    channel.appendLine(`Discovered tests: ${response.tests.length}`);
    channel.appendLine("");
    for (const test of response.tests) {
        const marker = test.testFile === response.activeTest ? " [ACTIVE]" : "";
        channel.appendLine(`  ${path.basename(test.testFile)}${marker}`);
        channel.appendLine(`    Path: ${test.testFile}`);
        channel.appendLine(`    Role: ${test.testerRole}`);
        channel.appendLine(
            `    Exports: ${test.exportCount} | Imports: ${test.importCount} | Includes: ${test.includeCount}`
        );
        channel.appendLine("");
    }
    channel.show(true);
}

// ---- Active Editor Changed ----

export async function onActiveEditorChanged(
    client: LanguageClient,
    editor: vscode.TextEditor | undefined,
    autoDetect: boolean
): Promise<void> {
    if (!autoDetect) {
        return;
    }

    if (!editor || editor.document.languageId !== "ivy") {
        return;
    }

    const uri = editor.document.uri.toString();

    try {
        await client.sendNotification("ivy/activeDocumentChanged", { uri });
    } catch {
        // Server may not support this notification yet -- ignore
    }
}

// ---- Refresh Status Bar from Server State ----

export async function refreshStatusBar(
    client: LanguageClient,
    statusBar: vscode.StatusBarItem
): Promise<void> {
    try {
        const response = await client.sendRequest<ListTestsResponse>(
            "ivy/listTests"
        );
        updateStatusBar(statusBar, response.activeTest);
    } catch {
        // Server not ready or feature not available
    }
}
