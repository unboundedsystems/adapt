import Adapt, {
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState
} from "@usys/adapt";
import { mkdtmp } from "@usys/utils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";

async function withTmpDir<T>(prefix: string, f: (tmpDir: string) => Promise<T> | T): Promise<T> {
    const tmpDir = await mkdtmp(prefix);
    try {
        return await f(tmpDir);
    } finally {
        await fs.remove(tmpDir);
    }
}

interface DockerBuildOptions {
    dockerHost?: string;
    tag?: string;
    forceRm?: boolean;
}

const defaultDockerBuildOptions = {
    forceRm: true,
};

async function dockerBuild(dockerfile: string, contextPath: string,
    options: DockerBuildOptions = {}): Promise<string> {

    const opts = { ...defaultDockerBuildOptions, ...options };

    const args = [ "build", "-f", dockerfile ];
    if (opts.forceRm) args.push("--force-rm");
    if (opts.dockerHost) args.push("-H", opts.dockerHost);
    if (opts.tag) args.push("-t", opts.tag);
    args.push(contextPath);

    const { stdout, stderr } = await execa("docker", args);
    const match = /^Successfully built ([0-9a-zA-Z]+)$/mg.exec(stdout);
    if (!match || !match[1]) throw new Error("Could not extract image sha\n" + stdout + "\n\n" + stderr);
    return match[1];
}

export async function localTypescriptBuild(srcDir: string, options: TypescriptBuildOptions = {}) {
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
        return dockerBuild(dockerfile, srcDir, options);
    });
}

export interface TypescriptBuildProps extends Partial<BuiltinProps> {
    srcDir: string;
    options?: TypescriptBuildOptions;
}

export function LocalTypescriptBuild(props: TypescriptBuildProps) {
    const imgSha = useAsync(async () => {
        //FIXME(manishv) Don't rebuild every time, use some kind of uptoda
        return localTypescriptBuild(props.srcDir, props.options);
    }, undefined);

    useImperativeMethods(() => ({
        buildComplete: () => imgSha !== undefined,
        imgSha
    }));
    return null;
}

interface TypescriptBuildOptions extends DockerBuildOptions { }

//Note(manishv) Break this out into a separate file?
export function useTypescriptBuild(srcDir: string, options: TypescriptBuildOptions = {}) {
    const [buildState, setBuildState] = useState("build");

    if (buildState === "build") {
        const buildHand = handle();

        setBuildState(async () => {
            if (buildHand.mountedOrig && buildHand.mountedOrig.instance.buildComplete()) {
                return buildHand.mountedOrig.instance.imgSha;
            }
            return "build";
        });
        return { buildObj:
            <LocalTypescriptBuild handle={buildHand} srcDir={srcDir} options={options} />
        };
    }

    return { imgSha: buildState, buildObj: null };
}

//Note(manishv) Break this out into a separate file
export function useAsync<T>(f: () => Promise<T> | T, initial: T): T {
    const [val, setVal] = useState(initial);
    setVal(f);
    return val;
}
