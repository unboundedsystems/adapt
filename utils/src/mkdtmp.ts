import * as fs from "fs-extra";
import graceful from "node-graceful";
import * as os from "os";
import * as path from "path";

export interface MkdtmpPromise extends Promise<string> {
    remove(): Promise<void>;
}

export function mkdtmp(prefix: string, basedir = os.tmpdir()): MkdtmpPromise {
    let newDir: string | undefined;
    let removeOnExit: () => void | undefined;

    const retP = fs.mkdtemp(path.join(basedir, prefix + "-"))
        .then((dir) => {
            newDir = dir;
            removeOnExit = graceful.on("exit", remove, true);
            return newDir;
        });
    // tslint:disable-next-line:prefer-object-spread
    return Object.assign(retP, { remove });

    async function remove() {
        if (newDir) await fs.remove(newDir);
        if (removeOnExit) removeOnExit();
    }
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

    const tmpDirP = mkdtmp(prefix, basedir);
    try {
        const tmpDir = await tmpDirP;
        return await f(tmpDir);
    } finally {
        await tmpDirP.remove();
    }
}
