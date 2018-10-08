import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

// tslint:disable-next-line:no-var-requires
const onExit = require("signal-exit");

export async function mkdtmp(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix + "-"))
        .then((newDir) => {
            onExit(() => fs.removeSync(newDir));
            return newDir;
        });
}
