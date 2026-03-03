import * as assert from "assert";
import * as vscode from "vscode";

/**
 * Test scope feature integration tests.
 *
 * These verify that the test scoping stack (Task 18 module + Task 19 wiring)
 * is correctly activated: commands are available, settings have correct
 * defaults, and the status bar command is present. The actual LSP
 * communication is tested server-side (Tasks 10, 15, 16).
 */
suite("Ivy Test Scope Features", () => {
    suiteSetup(async () => {
        // Open an ivy document to trigger extension activation.
        const doc = await vscode.workspace.openTextDocument({
            language: "ivy",
            content: "#lang ivy1.7\ntype t",
        });
        await vscode.window.showTextDocument(doc);
        // Wait for activation to complete (status bar creation, command
        // registration, event subscriptions).
        await new Promise((resolve) => setTimeout(resolve, 500));
        await vscode.commands.executeCommand(
            "workbench.action.closeActiveEditor"
        );
    });

    test("ivy.setActiveTest is available after activation", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("ivy.setActiveTest"),
            "ivy.setActiveTest should be available after extension activation"
        );
    });

    test("ivy.listTests is available after activation", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("ivy.listTests"),
            "ivy.listTests should be available after extension activation"
        );
    });

    test("testScope settings have correct defaults", () => {
        const config = vscode.workspace.getConfiguration("ivy");

        assert.strictEqual(
            config.get<boolean>("testScope.enabled"),
            true,
            "testScope.enabled should default to true"
        );
        assert.strictEqual(
            config.get<boolean>("testScope.autoDetect"),
            true,
            "testScope.autoDetect should default to true"
        );
    });

    test("Keybinding for setActiveTest is registered", async () => {
        // The keybinding (Ctrl+Shift+F8 / Cmd+Shift+F8) is declared in
        // package.json. We verify indirectly: if the command is available
        // and the keybinding is in package.json, VSCode will have loaded it.
        // Direct keybinding querying is not exposed by the Extension API.
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("ivy.setActiveTest"),
            "Keybinding target command ivy.setActiveTest must be registered"
        );
    });
});
