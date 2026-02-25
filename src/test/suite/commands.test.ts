import * as assert from "assert";
import * as vscode from "vscode";

/**
 * Command registration tests for Ivy tool actions.
 *
 * These verify that the new verify/compile/showModel/cancel commands
 * are registered when the extension activates.
 */
suite("Ivy Tool Commands", () => {
    test("ivy.verify command is registered", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("ivy.verify"),
            "ivy.verify should be registered"
        );
    });

    test("ivy.compile command is registered", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("ivy.compile"),
            "ivy.compile should be registered"
        );
    });

    test("ivy.showModel command is registered", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("ivy.showModel"),
            "ivy.showModel should be registered"
        );
    });

    test("ivy.cancelOperation command is registered", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes("ivy.cancelOperation"),
            "ivy.cancelOperation should be registered"
        );
    });

    test("Tool settings are accessible", () => {
        const config = vscode.workspace.getConfiguration("ivy");

        const verifyTimeout = config.get<number>("tools.verifyTimeout");
        assert.strictEqual(
            typeof verifyTimeout,
            "number",
            "ivy.tools.verifyTimeout should be a number"
        );
        assert.strictEqual(verifyTimeout, 120, "Default verify timeout should be 120");

        const compileTimeout = config.get<number>("tools.compileTimeout");
        assert.strictEqual(
            typeof compileTimeout,
            "number",
            "ivy.tools.compileTimeout should be a number"
        );
        assert.strictEqual(compileTimeout, 300, "Default compile timeout should be 300");

        const autoSave = config.get<boolean>("tools.autoSaveBeforeAction");
        assert.strictEqual(
            typeof autoSave,
            "boolean",
            "ivy.tools.autoSaveBeforeAction should be a boolean"
        );
        assert.strictEqual(autoSave, true, "Default autoSave should be true");
    });
});
