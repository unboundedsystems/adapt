import { waitFor } from "@adpt/utils";
import * as fs from "fs-extra";
import path from "path";

export async function installOnce(
    installId: string,
    timeoutSec: number,
    action: () => Promise<void>): Promise<void> {

    const baseDir = path.join("/", "var", "run", "adapt_test_install");
    const dir = path.join(baseDir, installId);
    const statusFile = path.join(dir, "status");

    await fs.ensureDir(baseDir);
    try {
        // Directory creation is atomic, even on most (all?) network filesystems
        await fs.mkdir(dir);
    } catch (err) {
        if (err.code !== "EEXIST") throw err;

        // Someone else is installing or has installed already
        await waitFor(timeoutSec, 1, `Timed out waiting for ${installId} install`,
            async () => fs.pathExists(statusFile));
        const status = (await fs.readFile(statusFile)).toString();
        if (status === "success") return;
        throw new Error(`Install of ${installId} failed: ${status}`);
    }

    try {
        await action();
        await fs.writeFile(statusFile, "success");
    } catch (err) {
        await fs.writeFile(statusFile, String(err));
    }
}
