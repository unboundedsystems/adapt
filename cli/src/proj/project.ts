import * as fs from "fs-extra";
import * as os from "os";
import * as pacote from "pacote";
import * as path from "path";

// tslint:disable-next-line:no-var-requires
const onExit = require("signal-exit");

export interface ProjectOptions {
    cacheDir?: string;
}

const defaultOptions: ProjectOptions = {
};

export async function load(projectSpec: string, projectOpts?: ProjectOptions) {
    const finalOpts = { ...defaultOptions, ...projectOpts };
    if (!finalOpts.cacheDir) finalOpts.cacheDir = await mkdtmp();

    const pacoteOpts = {
        cache: finalOpts.cacheDir,
    };
    const manifest = await pacote.manifest(projectSpec, pacoteOpts);

    return new Project(manifest, finalOpts);
}

async function mkdtmp(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "adapt-cli-cache-"))
        .then((newDir) => {
            onExit(() => fs.removeSync(newDir));
            return newDir;
        });
}

export class Project {
    constructor(public manifest: pacote.Manifest,
                // @ts-ignore - options never read
                private options: ProjectOptions) {
    }
}
