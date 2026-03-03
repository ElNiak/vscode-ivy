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
 * Detect whether ivy-lsp is installed as a PEP 660 editable install.
 * Uses `direct_url.json` from the distribution metadata.
 */
export async function isEditableInstall(pythonPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        cp.execFile(
            pythonPath,
            [
                "-c",
                'import json, importlib.metadata; ' +
                'd = importlib.metadata.distribution("ivy-lsp"); ' +
                'u = d.read_text("direct_url.json"); ' +
                'print(json.loads(u).get("dir_info",{}).get("editable",False) if u else False)',
            ],
            { timeout: 5_000 },
            (error, stdout) => {
                resolve(!error && stdout.trim() === "True");
            }
        );
    });
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
                const result = await runProcess(
                    pythonPath,
                    ["-m", "venv", venvDir],
                    token
                );
                if (!result.success) {
                    console.warn(`[ivy-lsp] Process failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`);
                    vscode.window.showErrorMessage(
                        "Ivy LSP: Failed to create virtual environment."
                    );
                    return undefined;
                }
            }

            if (token.isCancellationRequested) {
                return undefined;
            }

            // Skip managed install if an editable (dev) install already exists.
            if (await isEditableInstall(py)) {
                console.log("[ivy-lsp] Editable install detected — skipping managed install.");
                return py;
            }

            // Step 2: Install ivy-lsp (light, no z3).
            progress.report({ message: "Installing ivy-lsp..." });
            const pip = venvPip();
            // DEV-ONLY: installs from GitHub HEAD. Pin to a tag (@vX.Y.Z) before release.
            const installResult = await runProcess(
                pip,
                ["install", "--upgrade", "--no-cache-dir", "ivy-lsp @ git+https://github.com/ElNiak/ivy-lsp.git"],
                token
            );
            if (!installResult.success) {
                console.warn(`[ivy-lsp] Process failed (exit ${installResult.exitCode}): ${installResult.stderr.slice(0, 500)}`);
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
            const result = await runProcess(
                pip,
                ["install", "--upgrade", "panther_ms_ivy[z3]"],
                token
            );
            if (!result.success) {
                console.warn(`[ivy-lsp] Process failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`);
                vscode.window.showErrorMessage(
                    "Ivy LSP: Failed to install z3 support. " +
                        "This is a large download (~200MB) and may take several minutes."
                );
            }
            return result.success;
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

    if (await isEditableInstall(py)) {
        console.log("[ivy-lsp] Editable install detected — skipping upgrade.");
        return true;
    }

    const pip = venvPip();
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: "Ivy LSP: Upgrading...",
            cancellable: true,
        },
        async (_progress, token) => {
            // DEV-ONLY: installs from GitHub HEAD. Pin to a tag (@vX.Y.Z) before release.
            const result = await runProcess(
                pip,
                ["install", "--upgrade", "--no-cache-dir", "ivy-lsp @ git+https://github.com/ElNiak/ivy-lsp.git"],
                token
            );
            if (!result.success) {
                console.warn(`[ivy-lsp] Process failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`);
                vscode.window.showErrorMessage(
                    "Ivy LSP: Failed to upgrade. Check your network connection."
                );
            }
            return result.success;
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

interface ProcessResult {
    success: boolean;
    exitCode: number | null;
    stderr: string;
}

function runProcess(
    command: string,
    args: string[],
    token: vscode.CancellationToken,
): Promise<ProcessResult> {
    return new Promise((resolve) => {
        const proc = cp.spawn(command, args, {
            stdio: "pipe",
            env: { ...process.env },
        });

        let stderr = "";
        proc.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        const dispose = token.onCancellationRequested(() => {
            proc.kill();
            resolve({ success: false, exitCode: null, stderr: "Cancelled by user" });
        });

        proc.on("close", (code) => {
            dispose.dispose();
            resolve({ success: code === 0, exitCode: code, stderr });
        });

        proc.on("error", (err) => {
            dispose.dispose();
            resolve({ success: false, exitCode: null, stderr: err.message });
        });
    });
}
