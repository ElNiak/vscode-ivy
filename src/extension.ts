import * as vscode from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    Trace,
    TransportKind,
} from "vscode-languageclient/node";
import { findPython, checkIvyLsp, clearCache, isPythonValid } from "./pythonFinder";
import {
    ensureIvyLspInstalled,
    installZ3Support,
    upgradeManagedIvyLsp,
    resetManagedVenv,
    getManagedVenvPython,
} from "./lspInstaller";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem;

export async function activate(
    context: vscode.ExtensionContext
): Promise<void> {
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    context.subscriptions.push(statusBarItem);

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
        })
    );

    const config = vscode.workspace.getConfiguration("ivy");
    const lspEnabled = config.get<boolean>("lsp.enabled", true);

    if (!lspEnabled) {
        setStatus("syntax-only");
        return;
    }

    await startClient(context);

    // Restart the server when relevant settings change.
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (
                e.affectsConfiguration("ivy.pythonPath") ||
                e.affectsConfiguration("ivy.lsp.enabled") ||
                e.affectsConfiguration("ivy.lsp.args") ||
                e.affectsConfiguration("ivy.lsp.managedInstall") ||
                e.affectsConfiguration("ivy.lsp.managedInstallPath") ||
                e.affectsConfiguration("ivy.lsp.logLevel")
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
}

export async function deactivate(): Promise<void> {
    await stopClient();
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
    if (ivyLspVersion && ivyLspVersion !== extensionVersion && managedPy) {
        setStatus("installing");
        const ok = await upgradeManagedIvyLsp();
        if (ok) {
            clearCache();
            // Re-check from the managed venv directly, not the originally-found python
            const newVersion = await checkIvyLsp(managedPy);
            if (newVersion && newVersion !== extensionVersion) {
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

    const serverOptions: ServerOptions = {
        command: pythonPath,
        args: ["-m", "ivy_lsp", ...extraArgs],
        transport: TransportKind.stdio,
        options: {
            env: { ...process.env, IVY_LSP_LOG_LEVEL: logLevel },
        },
    };

    const traceLevel = vscode.workspace
        .getConfiguration("ivy")
        .get<string>("lsp.trace.server", "off");

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "ivy" }],
        outputChannelName: "Ivy Language Server",
        traceOutputChannel: vscode.window.createOutputChannel(
            "Ivy LSP Trace"
        ),
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
