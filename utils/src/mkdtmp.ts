import * as fs from "fs-extra";
import graceful from "node-graceful";
import * as os from "os";
import * as path from "path";

export async function mkdtmp(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix + "-"))
        .then((newDir) => {
            graceful.on("exit", () => fs.removeSync(newDir), true);
            return newDir;
        });
}
