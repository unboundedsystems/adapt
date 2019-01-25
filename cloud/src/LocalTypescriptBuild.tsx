import Adapt, {
    AdaptElement,
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState
} from "@usys/adapt";
import { mkdtmp } from "@usys/utils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import { useAsync } from "./hooks";
import { dockerBuild, DockerBuildOptions, ImageInfo } from "./LocalDockerBuild";

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
    forceRm?: boolean;
    imageName?: string;
    imageTag?: string;
    uniqueTag?: boolean;
}

const defaultDockerBuildOptions = {
    forceRm: true,
    uniqueTag: false,
};

export interface ImageInfo {
    id: string;
    nameTag?: string;
}

async function dockerBuild(dockerfile: string, contextPath: string,
    options: DockerBuildOptions = {}): Promise<ImageInfo> {

    const opts = { ...defaultDockerBuildOptions, ...options };
    let nameTag: string | undefined;

    const args = [ "build", "-f", dockerfile ];
    if (opts.forceRm) args.push("--force-rm");
    if (opts.dockerHost) args.push("-H", opts.dockerHost);
    if (opts.imageName) {
        const tag = createTag(opts.imageTag, opts.uniqueTag);
        nameTag = tag ? `${opts.imageName}:${tag}` : opts.imageName;
        args.push("-t", nameTag);
    }
    args.push(contextPath);

    const { stdout, stderr } = await execa("docker", args);
    const match = /^Successfully built ([0-9a-zA-Z]+)$/mg.exec(stdout);
    if (!match || !match[1]) throw new Error("Could not extract image sha\n" + stdout + "\n\n" + stderr);
    const inspectOut = await execa.stdout("docker", ["inspect", match[1]]);
    try {
        const inspect = JSON.parse(inspectOut);
        if (!Array.isArray(inspect)) throw new Error(`Image inspect result is not an array`);
        if (inspect.length === 0) throw new Error(`Built image ID not found`);
        if (inspect.length > 1) throw new Error(`Multiple images found for ID`);

        const ret: ImageInfo = { id: inspect[0].Id };
        if (nameTag) ret.nameTag = nameTag;
        return ret;

    } catch (err) {
        throw new Error(`Error while inspecting built image ID ${match[1]}: ${err.message}`);
    }
}

function createTag(baseTag: string | undefined, appendUnique: boolean): string | undefined {
    if (!baseTag && !appendUnique) return undefined;
    let tag = baseTag || "";
    if (baseTag && appendUnique) tag += "-";
    if (appendUnique) {
        tag += randomstring.generate({
            length: 8,
            charset: "alphabetic",
            readable: true,
            capitalization: "lowercase",
        });
    }
    return tag;
}

export async function localTypescriptBuild(srcDir: string,
    options: TypescriptBuildOptions = {}): Promise<ImageInfo> {

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

function LocalTypescriptBuild(props: TypescriptBuildProps) {
    const image = useAsync(async () => {
        //FIXME(manishv) Don't rebuild every time, use some kind of uptoda
        return localTypescriptBuild(props.srcDir, props.options);
    }, undefined);

    useImperativeMethods(() => ({
        buildComplete: () => image !== undefined,
        image
    }));
    return null;
}

export interface TypescriptBuildOptions extends DockerBuildOptions { }

const defaultLocalTsBuildOptions = {
    imageName: "tsservice",
    uniqueTag: true,
};

export interface BuildStatus {
    buildObj: AdaptElement<TypescriptBuildOptions> | null;
    image?: ImageInfo;
}

//Note(manishv) Break this out into a separate file?
export function useTypescriptBuild(srcDir: string,
    options: TypescriptBuildOptions = {}): BuildStatus {

    const opts = { ...defaultLocalTsBuildOptions, ...options };
    const [buildState, setBuildState] = useState<ImageInfo | undefined>(undefined);

    if (!buildState) {
        const buildHand = handle();

        setBuildState(async () => {
            if (buildHand.mountedOrig && buildHand.mountedOrig.instance.buildComplete()) {
                return buildHand.mountedOrig.instance.image;
            }
            return undefined;
        });
        return { buildObj:
            <LocalTypescriptBuild handle={buildHand} srcDir={srcDir} options={opts} />
        };
    }

    return { image: buildState, buildObj: null };
}

