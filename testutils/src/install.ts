import { waitFor } from "@usys/utils";
import execa from "execa";
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

export async function installAnsible(verbose = false) {
    await installOnce("ansible", 2 * 60, async () => {
        const opts: execa.Options = verbose ? { stdio: "inherit" } : {};
        await fs.writeFile("/etc/apt/sources.list.d/ansible.list",
            "deb http://ppa.launchpad.net/ansible/ansible/ubuntu trusty main\n");
        await execa("apt-key", ["adv", "--keyserver", "keyserver.ubuntu.com",
            "--recv-keys", "93C4A3FD7BB9C367"], opts);
        await execa("apt-get", ["update"], opts);
        await execa("apt-get", ["install", "-y", "--no-install-recommends", "ansible"], opts);
    });
}
