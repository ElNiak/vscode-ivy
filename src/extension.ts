import * as vscode from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    Trace,
    TransportKind,
    ErrorHandler,
    ErrorAction,
    CloseAction,
    Message,
    ErrorHandlerResult,
    CloseHandlerResult,
} from "vscode-languageclient/node";
import { findPython, checkIvyLsp, clearCache, isPythonValid } from "./pythonFinder";
import {
    ensureIvyLspInstalled,
    installZ3Support,
    upgradeManagedIvyLsp,
    resetManagedVenv,
    getManagedVenvPython,
} from "./lspInstaller";
import {
    verifyCommand,
    compileCommand,
    showModelCommand,
    cancelCommand,
} from "./ivyActions";
import {
    createTestScopeStatusBar,
    setActiveTestCommand,
    listTestsCommand,
    onActiveEditorChanged,
    refreshStatusBar,
    updateStatusBar,
} from "./testScope";
import { isOlderVersion } from "./version";
import { LspStateTracker } from "./lspStateTracker";
import { MonitorTreeProvider } from "./monitorTreeProvider";
import { DashboardPanel } from "./dashboardPanel";
import { ModelDataProvider } from "./modelDataProvider";
import { RequirementTreeProvider } from "./requirements/requirementTreeProvider";
import {
    applyRequirementDecorations,
    clearRequirementDecorations,
} from "./requirements/requirementDecorations";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem;
let testScopeStatusBar: vscode.StatusBarItem;
let stateTracker: LspStateTracker | undefined;
let treeProvider: MonitorTreeProvider | undefined;
let modelDataProvider: ModelDataProvider | undefined;
let reqTreeProvider: RequirementTreeProvider | undefined;

export async function activate(
    context: vscode.ExtensionContext
): Promise<void> {
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    context.subscriptions.push(statusBarItem);

    testScopeStatusBar = createTestScopeStatusBar(context);
    const scopeEnabled = vscode.workspace
        .getConfiguration("ivy")
        .get<boolean>("testScope.enabled", true);
    if (!scopeEnabled) {
        testScopeStatusBar.hide();
    }

    // Register commands.
    context.subscriptions.push(
        vscode.commands.registerCommand("ivy.installServer", async () => {
            clearCache();
            await stopClient();
            const pythonPath = await findPython();
            if (!pythonPath) {
                vscode.window.showErrorMessage(
                    "Ivy LSP: No Python interpreter found. Install Python 3.10+."
                );
                return;
            }
            const managed = await ensureIvyLspInstalled(pythonPath);
            if (managed) {
                vscode.window.showInformationMessage(
                    "Ivy LSP: Language server installed successfully."
                );
                clearCache();
                await startClient(context);
            }
        }),
        vscode.commands.registerCommand("ivy.installFullSupport", async () => {
            const py = getManagedVenvPython();
            if (!py) {
                vscode.window.showErrorMessage(
                    "Ivy LSP: No managed installation found. Run 'Ivy: Install Language Server' first."
                );
                return;
            }
            const ok = await installZ3Support(py);
            if (ok) {
                vscode.window.showInformationMessage(
                    "Ivy LSP: Full support (z3) installed. Restarting server..."
                );
                clearCache();
                await stopClient();
                await startClient(context);
            }
        }),
        vscode.commands.registerCommand("ivy.resetServer", async () => {
            await stopClient();
            await resetManagedVenv();
            clearCache();
            vscode.window.showInformationMessage(
                "Ivy LSP: Managed installation removed. Restarting..."
            );
            await startClient(context);
        }),
        vscode.commands.registerCommand("ivy.verify", (uri?: vscode.Uri) => {
            if (!client) {
                vscode.window.showWarningMessage("Ivy LSP is not running.");
                return;
            }
            verifyCommand(client, uri);
        }),
        vscode.commands.registerCommand("ivy.compile", (uri?: vscode.Uri) => {
            if (!client) {
                vscode.window.showWarningMessage("Ivy LSP is not running.");
                return;
            }
            compileCommand(client, uri);
        }),
        vscode.commands.registerCommand("ivy.showModel", (uri?: vscode.Uri) => {
            if (!client) {
                vscode.window.showWarningMessage("Ivy LSP is not running.");
                return;
            }
            showModelCommand(client, uri);
        }),
        vscode.commands.registerCommand("ivy.cancelOperation", cancelCommand),
        vscode.commands.registerCommand("ivy.setActiveTest", async () => {
            if (!client) {
                vscode.window.showWarningMessage("Ivy LSP is not running.");
                return;
            }
            await setActiveTestCommand(client);
            await refreshStatusBar(client, testScopeStatusBar);
        }),
        vscode.commands.registerCommand("ivy.listTests", async () => {
            if (!client) {
                vscode.window.showWarningMessage("Ivy LSP is not running.");
                return;
            }
            await listTestsCommand(client);
        }),
        vscode.commands.registerCommand("ivy.refreshMonitor", () =>
            stateTracker?.refreshNow()
        ),
        vscode.commands.registerCommand("ivy.reindexWorkspace", async () => {
            const result = await stateTracker?.sendReindex();
            if (result) {
                vscode.window.showInformationMessage(result.message);
            }
        }),
        vscode.commands.registerCommand("ivy.clearCache", async () => {
            const result = await stateTracker?.sendClearCache();
            if (result) {
                vscode.window.showInformationMessage(result.message);
            }
        }),
        vscode.commands.registerCommand("ivy.editIncludePaths", () => {
            vscode.commands.executeCommand(
                "workbench.action.openSettings",
                "ivy.lsp.includePaths"
            );
        }),
        vscode.commands.registerCommand("ivy.editExcludePaths", () => {
            vscode.commands.executeCommand(
                "workbench.action.openSettings",
                "ivy.lsp.excludePaths"
            );
        }),
        vscode.commands.registerCommand("ivy.checkForUpdates", async () => {
            const ok = await upgradeManagedIvyLsp();
            if (ok) {
                vscode.window.showInformationMessage(
                    "Ivy LSP: Upgrade complete. Restart server to apply."
                );
            } else {
                vscode.window.showInformationMessage(
                    "Ivy LSP: Already up to date."
                );
            }
        }),
        vscode.commands.registerCommand("ivy.openDashboard", () => {
            if (stateTracker) {
                DashboardPanel.show(context, stateTracker);
            }
        }),
        vscode.commands.registerCommand("ivy.showOutput", () => {
            client?.outputChannel?.show(true);
        }),
        vscode.commands.registerCommand("ivy.toggleDebugLog", async () => {
            const config = vscode.workspace.getConfiguration("ivy");
            const current = config.get<string>("lsp.logLevel", "INFO");
            const next = current === "DEBUG" ? "INFO" : "DEBUG";
            await config.update(
                "lsp.logLevel",
                next,
                vscode.ConfigurationTarget.Workspace
            );
            // Config change handler will restart the server automatically.
            // Show the output channel so the user sees the logs.
            client?.outputChannel?.show(true);
            vscode.window.showInformationMessage(
                `Ivy LSP: Log level set to ${next}. Server restarting...`
            );
        }),
        vscode.commands.registerCommand("ivy.refreshRequirements", () =>
            modelDataProvider?.refreshNow(),
        ),
        vscode.commands.registerCommand(
            "ivy.showActionRequirements",
            async (actionName?: string) => {
                // Focus the requirements tree view sidebar panel.
                await vscode.commands.executeCommand("ivyRequirements.focus");
                // Refresh data so decorations use the latest model state.
                await modelDataProvider?.refreshNow();
                // Apply gutter decorations to the active editor.
                const editor = vscode.window.activeTextEditor;
                if (editor && modelDataProvider) {
                    applyRequirementDecorations(
                        editor,
                        modelDataProvider,
                        actionName,
                    );
                }
            },
        ),
        vscode.commands.registerCommand("ivy.openModelVisualization", () => {
            // Placeholder: Phase 6 (Task 17) will open the webview panel.
            vscode.window.showInformationMessage(
                "Ivy: Model Visualization panel coming soon.",
            );
        }),
    );

    // Set up monitoring tree view at activation time so the panel is
    // available immediately, showing "Not connected" until the server is ready.
    stateTracker = new LspStateTracker(null);
    treeProvider = new MonitorTreeProvider(stateTracker);
    const treeView = vscode.window.createTreeView("ivyMonitor", {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    treeView.onDidChangeVisibility((e) =>
        stateTracker?.setVisible(e.visible)
    );
    context.subscriptions.push(treeView, stateTracker);

    // Set up model data provider for visualization features.
    modelDataProvider = new ModelDataProvider(null);
    context.subscriptions.push(modelDataProvider);

    // Set up requirements tree view.
    reqTreeProvider = new RequirementTreeProvider(modelDataProvider);
    const reqTreeView = vscode.window.createTreeView("ivyRequirements", {
        treeDataProvider: reqTreeProvider,
        showCollapseAll: true,
    });
    reqTreeView.onDidChangeVisibility((e) =>
        modelDataProvider?.setVisible(e.visible),
    );
    context.subscriptions.push(reqTreeView, reqTreeProvider);

    // Refresh requirement decorations whenever model data changes.
    context.subscriptions.push(
        modelDataProvider.onDidChange(() => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === "ivy" && modelDataProvider) {
                applyRequirementDecorations(editor, modelDataProvider);
            }
        }),
    );

    // When the active editor changes, apply or clear decorations.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor || !modelDataProvider) {
                return;
            }
            if (editor.document.languageId === "ivy") {
                applyRequirementDecorations(editor, modelDataProvider);
            } else {
                clearRequirementDecorations(editor);
            }
        }),
    );

    const config = vscode.workspace.getConfiguration("ivy");
    const lspEnabled = config.get<boolean>("lsp.enabled", true);

    if (!lspEnabled) {
        setStatus("syntax-only");
        return;
    }

    await startClient(context);

    // React to configuration changes.
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            // testScope.enabled: show/hide status bar without restarting LSP.
            if (e.affectsConfiguration("ivy.testScope.enabled")) {
                const scopeNowEnabled = vscode.workspace
                    .getConfiguration("ivy")
                    .get<boolean>("testScope.enabled", true);
                if (scopeNowEnabled) {
                    testScopeStatusBar.show();
                } else {
                    testScopeStatusBar.hide();
                }
            }

            // LSP-related settings: restart the server.
            if (
                e.affectsConfiguration("ivy.pythonPath") ||
                e.affectsConfiguration("ivy.lsp.enabled") ||
                e.affectsConfiguration("ivy.lsp.args") ||
                e.affectsConfiguration("ivy.lsp.managedInstall") ||
                e.affectsConfiguration("ivy.lsp.managedInstallPath") ||
                e.affectsConfiguration("ivy.lsp.logLevel") ||
                e.affectsConfiguration("ivy.lsp.maxRestartCount") ||
                e.affectsConfiguration("ivy.lsp.restartWindow") ||
                e.affectsConfiguration("ivy.lsp.includePaths") ||
                e.affectsConfiguration("ivy.lsp.excludePaths") ||
                e.affectsConfiguration("ivy.codeLens.enabled") ||
                e.affectsConfiguration("ivy.codeLens.rfcCoverage")
            ) {
                clearCache();
                await stopClient();

                const nowEnabled = vscode.workspace
                    .getConfiguration("ivy")
                    .get<boolean>("lsp.enabled", true);

                if (nowEnabled) {
                    await startClient(context);
                } else {
                    setStatus("syntax-only");
                }
            }
        })
    );

    // Auto-detect test scope on editor focus change (debounced to avoid
    // flooding the server with ivy/listTests requests when switching tabs).
    let editorChangeTimer: ReturnType<typeof setTimeout> | undefined;
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editorChangeTimer) {
                clearTimeout(editorChangeTimer);
            }
            editorChangeTimer = setTimeout(async () => {
                editorChangeTimer = undefined;
                if (!client) {
                    return;
                }
                const autoDetect = vscode.workspace
                    .getConfiguration("ivy")
                    .get<boolean>("testScope.autoDetect", true);
                await onActiveEditorChanged(client, editor, autoDetect);
                await refreshStatusBar(client, testScopeStatusBar);
            }, 500);
        })
    );
}

export async function deactivate(): Promise<void> {
    stateTracker?.dispose();
    stateTracker = undefined;
    reqTreeProvider?.dispose();
    reqTreeProvider = undefined;
    modelDataProvider?.dispose();
    modelDataProvider = undefined;
    await stopClient();
}

// ---------------------------------------------------------------------------
// Configurable crash recovery
// ---------------------------------------------------------------------------

class ConfigurableErrorHandler implements ErrorHandler {
    private restarts: number[] = [];
    private readonly maxRestartCount: number;
    private readonly restartWindowMs: number;

    constructor(maxRestartCount: number, restartWindowSeconds: number) {
        this.maxRestartCount = maxRestartCount;
        this.restartWindowMs = restartWindowSeconds * 1000;
    }

    error(
        _error: Error,
        _message: Message | undefined,
        count: number | undefined
    ): ErrorHandlerResult {
        if (count && count <= 3) {
            return { action: ErrorAction.Continue };
        }
        return { action: ErrorAction.Shutdown };
    }

    closed(): CloseHandlerResult {
        if (this.maxRestartCount === -1) {
            return { action: CloseAction.Restart };
        }

        this.restarts.push(Date.now());
        if (this.restarts.length <= this.maxRestartCount) {
            return { action: CloseAction.Restart };
        }

        const diff =
            this.restarts[this.restarts.length - 1] - this.restarts[0];
        if (diff <= this.restartWindowMs) {
            return {
                action: CloseAction.DoNotRestart,
                message: `The Ivy Language Server crashed ${this.maxRestartCount + 1} times in the last ${Math.round(this.restartWindowMs / 1000)}s. The server will not be restarted.`,
            };
        }

        this.restarts.shift();
        return { action: CloseAction.Restart };
    }
}

// ---------------------------------------------------------------------------
// Client lifecycle
// ---------------------------------------------------------------------------

async function startClient(
    context: vscode.ExtensionContext
): Promise<void> {
    const pythonPath = await findPython();

    if (!pythonPath) {
        vscode.window.showWarningMessage(
            "Ivy LSP: No Python interpreter found. " +
                "Syntax highlighting is still active. " +
                'Set "ivy.pythonPath" or install Python 3.10+ to enable language support.'
        );
        setStatus("syntax-only");
        return;
    }

    let ivyLspVersion = await checkIvyLsp(pythonPath);

    // If the managed venv has an outdated version, upgrade automatically.
    const extensionVersion = context.extension.packageJSON.version as string;
    const managedPy = getManagedVenvPython();
    if (ivyLspVersion && isOlderVersion(ivyLspVersion, extensionVersion) && managedPy) {
        setStatus("installing");
        const ok = await upgradeManagedIvyLsp();
        if (ok) {
            clearCache();
            // Re-check from the managed venv directly, not the originally-found python
            const newVersion = await checkIvyLsp(managedPy);
            if (newVersion && isOlderVersion(newVersion, extensionVersion)) {
                vscode.window.showWarningMessage(
                    `Ivy LSP: Upgraded to v${newVersion} but extension expects v${extensionVersion}. ` +
                    `The latest published version may not match yet.`
                );
            }
            ivyLspVersion = newVersion;
            // Continue with managed venv python since that's what was upgraded
            if (ivyLspVersion) {
                return startWithPython(context, managedPy, ivyLspVersion);
            }
        }
    }

    // If ivy-lsp is not installed, try managed auto-install.
    if (!ivyLspVersion) {
        const managedInstallEnabled = vscode.workspace
            .getConfiguration("ivy")
            .get<boolean>("lsp.managedInstall", true);

        if (managedInstallEnabled) {
            // Find a system python to create the venv from.
            // The pythonPath we found may be a workspace venv without ivy-lsp;
            // for venv creation we need any working Python.
            let basePython = pythonPath;
            if (!(await isPythonValid(basePython))) {
                setStatus("syntax-only");
                return;
            }

            setStatus("installing");
            const managedPy = await ensureIvyLspInstalled(basePython);

            if (managedPy) {
                ivyLspVersion = await checkIvyLsp(managedPy);
                if (ivyLspVersion) {
                    clearCache();
                    // Re-find python — will now discover the managed venv.
                    return startWithPython(
                        context,
                        managedPy,
                        ivyLspVersion
                    );
                }
            }

            // Managed install failed.
            vscode.window.showErrorMessage(
                "Ivy LSP: Auto-install failed. " +
                    "Install manually with: pip install ivy-lsp"
            );
            setStatus("syntax-only");
            return;
        }

        // Managed install disabled — show manual instructions.
        vscode.window.showErrorMessage(
            "Ivy LSP: The ivy_lsp package is not installed. " +
                "Install it with: pip install ivy-lsp",
            "Copy Install Command"
        ).then((selection) => {
            if (selection === "Copy Install Command") {
                vscode.env.clipboard.writeText("pip install ivy-lsp");
            }
        });
        setStatus("syntax-only");
        return;
    }

    await startWithPython(context, pythonPath, ivyLspVersion);
}

async function startWithPython(
    context: vscode.ExtensionContext,
    pythonPath: string,
    version: string
): Promise<void> {
    const extraArgs = vscode.workspace
        .getConfiguration("ivy")
        .get<string[]>("lsp.args", []);

    const logLevel = vscode.workspace
        .getConfiguration("ivy")
        .get<string>("lsp.logLevel", "INFO");

    const includePaths = vscode.workspace
        .getConfiguration("ivy")
        .get<string[]>("lsp.includePaths", []);

    const excludePaths = vscode.workspace
        .getConfiguration("ivy")
        .get<string[]>("lsp.excludePaths", ["submodules", "test"]);

    const parseWorkers = vscode.workspace
        .getConfiguration("ivy")
        .get<number>("lsp.parseWorkers", 0);

    const serverOptions: ServerOptions = {
        command: pythonPath,
        args: ["-m", "ivy_lsp", ...extraArgs],
        transport: TransportKind.stdio,
        options: {
            env: {
                ...process.env,
                IVY_LSP_LOG_LEVEL: logLevel,
                IVY_LSP_INCLUDE_PATHS: includePaths.join(","),
                IVY_LSP_EXCLUDE_PATHS: excludePaths.join(","),
                IVY_LSP_PARSE_WORKERS: String(parseWorkers),
            },
        },
    };

    const config = vscode.workspace.getConfiguration("ivy");

    const traceLevel = config.get<string>("lsp.trace.server", "off");
    const maxRestartCount = config.get<number>("lsp.maxRestartCount", 5);
    const restartWindow = config.get<number>("lsp.restartWindow", 180);

    const codeLensEnabled = vscode.workspace
        .getConfiguration("ivy")
        .get<boolean>("codeLens.enabled", true);

    const rfcCoverageEnabled = vscode.workspace
        .getConfiguration("ivy")
        .get<boolean>("codeLens.rfcCoverage", true);

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "ivy" }],
        outputChannelName: "Ivy Language Server",
        traceOutputChannel: vscode.window.createOutputChannel(
            "Ivy LSP Trace"
        ),
        errorHandler: new ConfigurableErrorHandler(
            maxRestartCount,
            restartWindow
        ),
        initializationOptions: {
            codeLens: {
                enabled: codeLensEnabled,
                rfcCoverage: rfcCoverageEnabled,
            },
        },
    };

    client = new LanguageClient(
        "ivy-language-server",
        "Ivy Language Server",
        serverOptions,
        clientOptions
    );

    // Set trace level if not "off".
    if (traceLevel !== "off") {
        const trace =
            traceLevel === "verbose" ? Trace.Verbose : Trace.Messages;
        await client.setTrace(trace);
    }

    // Listen for the server mode notification to set status accurately.
    let modeDetected = false;
    client.onNotification("window/logMessage", (params: { type: number; message: string }) => {
        if (!modeDetected && params.message.includes("Ivy LSP running in")) {
            modeDetected = true;
            if (params.message.includes("light mode")) {
                setStatus("running-light", version);
                // One-time suggestion to install full support.
                const managed = getManagedVenvPython();
                if (managed) {
                    offerFullInstall();
                }
            } else {
                setStatus("running-full", version);
            }
        }
    });

    try {
        await client.start();
        // Default to running-full until we hear from the server.
        if (!modeDetected) {
            setStatus("running-full", version);
        }
        // Refresh test scope status bar after successful start.
        const tsScopeEnabled = vscode.workspace
            .getConfiguration("ivy")
            .get<boolean>("testScope.enabled", true);
        if (tsScopeEnabled) {
            testScopeStatusBar.show();
            await refreshStatusBar(client, testScopeStatusBar);
        }

        // Point the existing tracker at the new client.
        stateTracker?.setClient(client);
        modelDataProvider?.setClient(client);
        modelDataProvider?.setVisible(true);
    } catch (err) {
        const message =
            err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(
            `Ivy LSP: Failed to start server — ${message}`
        );
        setStatus("error");
    }
}

async function stopClient(): Promise<void> {
    if (client) {
        try {
            await client.stop();
        } catch {
            // Client may already be stopped.
        }
        client = undefined;
    }
    stateTracker?.setClient(null);
    modelDataProvider?.setClient(null);
    if (testScopeStatusBar) {
        updateStatusBar(testScopeStatusBar, null);
    }
}

/** Show a one-time prompt offering z3/full install. */
function offerFullInstall(): void {
    vscode.window
        .showInformationMessage(
            "Ivy LSP is running in light mode. Install z3 for full diagnostics?",
            "Install Full Support",
            "Not Now"
        )
        .then((selection) => {
            if (selection === "Install Full Support") {
                vscode.commands.executeCommand("ivy.installFullSupport");
            }
        });
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

type StatusKind =
    | "running-full"
    | "running-light"
    | "syntax-only"
    | "installing"
    | "error";

function setStatus(kind: StatusKind, version?: string): void {
    switch (kind) {
        case "running-full":
            statusBarItem.text = `$(check) Ivy LSP${version ? ` v${version}` : ""}`;
            statusBarItem.tooltip = "Ivy Language Server is running (full mode)";
            statusBarItem.backgroundColor = undefined;
            statusBarItem.command = undefined;
            break;
        case "running-light":
            statusBarItem.text = `$(check) Ivy LSP${version ? ` v${version}` : ""} (Light)`;
            statusBarItem.tooltip =
                "Ivy LSP running in light mode — click to install full support";
            statusBarItem.backgroundColor = undefined;
            statusBarItem.command = "ivy.installFullSupport";
            break;
        case "syntax-only":
            statusBarItem.text = "$(warning) Ivy: Syntax Only";
            statusBarItem.tooltip =
                "Ivy LSP is not running — syntax highlighting only";
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                "statusBarItem.warningBackground"
            );
            statusBarItem.command = "ivy.installServer";
            break;
        case "installing":
            statusBarItem.text = "$(sync~spin) Ivy LSP: Installing...";
            statusBarItem.tooltip = "Installing the Ivy Language Server...";
            statusBarItem.backgroundColor = undefined;
            statusBarItem.command = undefined;
            break;
        case "error":
            statusBarItem.text = "$(error) Ivy LSP: Error";
            statusBarItem.tooltip = "Ivy Language Server encountered an error";
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                "statusBarItem.errorBackground"
            );
            statusBarItem.command = undefined;
            break;
    }
    statusBarItem.show();
}
