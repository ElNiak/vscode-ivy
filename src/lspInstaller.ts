import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const DEFAULT_BASE_DIR = path.join(os.homedir(), ".ivy-lsp");

/**
 * Return the base directory for the managed ivy-lsp installation.
 * Respects the `ivy.lsp.managedInstallPath` setting.
 */
function getBaseDir(): string {
    const custom = vscode.workspace
        .getConfiguration("ivy")
        .get<string>("lsp.managedInstallPath", "");
    return custom || DEFAULT_BASE_DIR;
}

/** Return the platform-specific python binary path inside the managed venv. */
function venvPython(): string {
    const base = getBaseDir();
    return process.platform === "win32"
        ? path.join(base, "venv", "Scripts", "python.exe")
        : path.join(base, "venv", "bin", "python");
}

/** Return the platform-specific pip binary path inside the managed venv. */
function venvPip(): string {
    const base = getBaseDir();
    return process.platform === "win32"
        ? path.join(base, "venv", "Scripts", "pip.exe")
        : path.join(base, "venv", "bin", "pip");
}

/**
 * Return the managed venv python path if the venv exists and has ivy_lsp installed.
 * Returns `undefined` otherwise.
 */
export function getManagedVenvPython(): string | undefined {
    const py = venvPython();
    return fs.existsSync(py) ? py : undefined;
}

/**
 * Ensure ivy-lsp is installed in the managed venv, creating it if needed.
 *
 * @param pythonPath A working system Python to create the venv from.
 * @returns The managed venv python path on success, or `undefined` on failure.
 */
export async function ensureIvyLspInstalled(
    pythonPath: string
): Promise<string | undefined> {
    const py = venvPython();

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Ivy LSP",
            cancellable: true,
        },
        async (progress, token) => {
            // Step 1: Create venv if it doesn't exist.
            if (!fs.existsSync(py)) {
                progress.report({ message: "Creating Python environment..." });
                const venvDir = path.join(getBaseDir(), "venv");
                const ok = await runProcess(
                    pythonPath,
                    ["-m", "venv", venvDir],
                    token
                );
                if (!ok) {
                    vscode.window.showErrorMessage(
                        "Ivy LSP: Failed to create virtual environment."
                    );
                    return undefined;
                }
            }

            if (token.isCancellationRequested) {
                return undefined;
            }

            // Step 2: Install ivy-lsp (light, no z3).
            progress.report({ message: "Installing ivy-lsp..." });
            const pip = venvPip();
            const ok = await runProcess(
                pip,
                ["install", "--upgrade", "--no-cache-dir", "ivy-lsp"],
                token
            );
            if (!ok) {
                vscode.window.showErrorMessage(
                    "Ivy LSP: Failed to install ivy-lsp. Check your network connection."
                );
                return undefined;
            }

            return py;
        }
    );
}

/**
 * Install z3 support into the managed venv.
 *
 * @param venvPythonPath The managed venv python path.
 * @returns `true` on success.
 */
export async function installZ3Support(
    venvPythonPath: string
): Promise<boolean> {
    const pip = venvPip();

    // Verify venv exists
    if (!fs.existsSync(venvPythonPath)) {
        vscode.window.showErrorMessage(
            "Ivy LSP: Managed environment not found. Run 'Ivy: Install Language Server' first."
        );
        return false;
    }

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Ivy LSP: Installing full support (z3)...",
            cancellable: true,
        },
        async (_progress, token) => {
            const ok = await runProcess(
                pip,
                ["install", "--upgrade", "panther_ms_ivy[z3]"],
                token
            );
            if (!ok) {
                vscode.window.showErrorMessage(
                    "Ivy LSP: Failed to install z3 support. " +
                        "This is a large download (~200MB) and may take several minutes."
                );
            }
            return ok;
        }
    );
}

/**
 * Upgrade ivy-lsp in the managed venv to the latest version.
 *
 * @returns `true` on success.
 */
export async function upgradeManagedIvyLsp(): Promise<boolean> {
    const py = getManagedVenvPython();
    if (!py) {
        return false;
    }

    const pip = venvPip();
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Ivy LSP: Upgrading...",
            cancellable: true,
        },
        async (_progress, token) => {
            const ok = await runProcess(
                pip,
                ["install", "--upgrade", "--no-cache-dir", "ivy-lsp"],
                token
            );
            if (!ok) {
                vscode.window.showErrorMessage(
                    "Ivy LSP: Failed to upgrade. Check your network connection."
                );
            }
            return ok;
        }
    );
}

/**
 * Delete the managed venv directory entirely.
 */
export async function resetManagedVenv(): Promise<void> {
    const venvDir = path.join(getBaseDir(), "venv");
    if (fs.existsSync(venvDir)) {
        fs.rmSync(venvDir, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function runProcess(
    command: string,
    args: string[],
    token: vscode.CancellationToken
): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = cp.spawn(command, args, {
            stdio: "pipe",
            env: { ...process.env },
        });

        const dispose = token.onCancellationRequested(() => {
            proc.kill();
            resolve(false);
        });

        proc.on("close", (code) => {
            dispose.dispose();
            resolve(code === 0);
        });

        proc.on("error", () => {
            dispose.dispose();
            resolve(false);
        });
    });
}
