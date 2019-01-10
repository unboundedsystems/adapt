import Adapt, {
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState
} from "@usys/adapt";
import execa from "execa";
import fs, { copy, pathExists, writeFile } from "fs-extra";
import ld from "lodash";
import path from "path";
import tmp from "tmp";

async function inDirectory<T>(dir: string, f: () => Promise<T> | T): Promise<T> {
    const old = process.cwd();
    try {
        process.chdir(dir);
        return await f();
    } finally {
        process.chdir(old);
    }
}

async function mkTmpDir(id: string): Promise<string> {
    return new Promise<string>((res, rej) => {
        tmp.dir({ template: `/tmp/${id}-XXXXXX` }, (err, dirPath) => err ? rej(err) : res(dirPath));
    });
}

async function inTmpDir<T>(id: string, f: () => Promise<T> | T): Promise<T> {
    const tmpDir = await mkTmpDir(id);
    try {
        return inDirectory(tmpDir, f);
    } finally {
        await fs.remove(tmpDir);
    }
}

async function dockerBuild(): Promise<string> {
    const { stdout, stderr } = await execa("docker", ["build", "."]);
    const outLines = stdout.split(/\r?\n/);
    const lastLine = ld.last(outLines);
    if (!lastLine) throw new Error("No output from docker build!");
    const match = /^Successfully built ([0-9a-zA-Z]+$)/g.exec(lastLine);
    if (!match || !match[1]) throw new Error("Could not extract image sha\n" + stdout + "\n\n" + stderr);
    return match[1];
}

export async function localTypescriptBuild(srcDir: string) {
    const absSrcDir = path.isAbsolute(srcDir) ? srcDir : path.resolve(srcDir);
    const srcDirBase = path.parse(srcDir).base;
    if (!await pathExists(absSrcDir)) throw new Error(`Source director ${srcDir} not found`);

    return inTmpDir("localTypescriptBuild", async () => {
        await copy(absSrcDir, ".");
        const pkgJSON = await fs.readFile(path.join(absSrcDir, "package.json"));
        const pkgInfo = JSON.parse(pkgJSON.toString());
        const main = pkgInfo.main ? pkgInfo.main : "index.js";
        await writeFile("Dockerfile", `FROM node:10
COPY ${srcDirBase} .
CHDIR ${srcDirBase}
RUN npm install
RUN npm run build
CMD [node, ${main}]
`);

        return dockerBuild();
    });
}

export default function LocalTypescriptBuild(props: { srcDir: string } & BuiltinProps) {
    const imgSha = useAsync(async () => {
        //FIXME(manishv) Don't rebuild every time, use some kind of uptoda
        return localTypescriptBuild(props.srcDir);
    }, undefined);

    useImperativeMethods(() => ({
        buildComplete: () => imgSha !== undefined,
        imgSha
    }));
    return null;
}

//Note(manishv) Break this out into a separate file?
export function useTypescriptBuild(srcDir: string) {
    const [buildState, setBuildState] = useState("build");
    const buildHand = handle();

    setBuildState(async () => {
        if (!buildHand.mountedOrig) return "build";
        if (buildHand.mountedOrig.instance.buildComplete()) {
            return buildHand.mountedOrig.instance.imgSha;
        }
    });

    if (buildState === "build") {
        return { buildObj: <LocalTypescriptBuild handle={buildHand} srcDir={srcDir} /> };
    }

    return { imgSha: buildState, buildObj: null };
}

//Note(manishv) Break this out into a separate file
export function useAsync<T>(f: () => Promise<T> | T, initial: T): T {
    const [val, setVal] = useState(initial);
    setVal(f);
    return val;
}
