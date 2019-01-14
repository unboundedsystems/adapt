import Adapt, {
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState
} from "@usys/adapt";
import { mkdtmp } from "@usys/utils";
import execa from "execa";
import fs from "fs-extra";
import ld from "lodash";
import path from "path";

async function withTmpDir<T>(prefix: string, f: (tmpDir: string) => Promise<T> | T): Promise<T> {
    const tmpDir = await mkdtmp(prefix);
    try {
        return await f(tmpDir);
    } finally {
        await fs.remove(tmpDir);
    }
}

async function dockerBuild(dockerfile: string, contextPath: string): Promise<string> {
    const { stdout, stderr } = await execa(
        "docker", ["build", "-f", dockerfile, "--force-rm", contextPath]);
    const outLines = stdout.split(/\r?\n/);
    const lastLine = ld.last(outLines);
    if (!lastLine) throw new Error("No output from docker build!");
    const match = /^Successfully built ([0-9a-zA-Z]+$)/g.exec(lastLine);
    if (!match || !match[1]) throw new Error("Could not extract image sha\n" + stdout + "\n\n" + stderr);
    return match[1];
}

export async function localTypescriptBuild(srcDir: string) {
    srcDir = path.resolve(srcDir);
    if (!(await fs.pathExists(srcDir))) throw new Error(`Source directory ${srcDir} not found`);
    const pkgInfo = await fs.readJson(path.join(srcDir, "package.json"));
    const main = pkgInfo.main ? pkgInfo.main : "index.js";

    return withTmpDir("adapt-typescript-build", async (tmpDir) => {
        const dockerfile = path.join(tmpDir, "Dockerfile");
        await fs.writeFile(dockerfile, `
FROM node:10-alpine
WORKDIR /app
ADD . /app
RUN npm install
RUN npm run build
CMD ["node", "${main}"]
`);
        return dockerBuild(dockerfile, srcDir);
    });
}

export interface TypescriptBuildProps extends Partial<BuiltinProps> {
    srcDir: string;
}

export function LocalTypescriptBuild(props: TypescriptBuildProps) {
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
export default LocalTypescriptBuild;

//Note(manishv) Break this out into a separate file?
export function useTypescriptBuild(srcDir: string) {
    const [buildState, setBuildState] = useState("build");

    if (buildState === "build") {
        const buildHand = handle();

        setBuildState(async () => {
            if (buildHand.mountedOrig && buildHand.mountedOrig.instance.buildComplete()) {
                return buildHand.mountedOrig.instance.imgSha;
            }
            return "build";
        });
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
