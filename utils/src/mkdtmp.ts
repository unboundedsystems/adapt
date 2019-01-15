import * as fs from "fs-extra";
import graceful from "node-graceful";
import * as os from "os";
import * as path from "path";

export async function mkdtmp(prefix: string, basedir = os.tmpdir()): Promise<string> {
    return fs.mkdtemp(path.join(basedir, prefix + "-"))
        .then((newDir) => {
            graceful.on("exit", () => fs.removeSync(newDir), true);
            return newDir;
        });
}

export interface WithTmpDirOpts {
    prefix?: string;
    basedir?: string;
}

const withTmpDirDefaults = {
    prefix: "tmp",
    basedir: os.tmpdir(),
};

export async function withTmpDir<T>(
    f: (tmpDir: string) => Promise<T> | T,
    options: WithTmpDirOpts = {}): Promise<T> {

    const { basedir, prefix } = { ...withTmpDirDefaults, ...options };

    const tmpDir = await mkdtmp(prefix, basedir);
    try {
        return await f(tmpDir);
    } finally {
        await fs.remove(tmpDir);
    }
}
