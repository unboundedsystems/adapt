import Adapt, {
    AdaptElement,
    handle,
    useImperativeMethods,
    useState
} from "@usys/adapt";
import { mkdtmp } from "@usys/utils";
import execa from "execa";
import fs from "fs-extra";
import ld from "lodash";
import randomstring from "randomstring";
import { useAsync } from "./hooks";

export interface ImageInfo {
    id: string;
    nameTag?: string;
}

export interface DockerBuildOptions {
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

async function dockerBuild(
    dockerfile: string,
    contextPath: string,
    options: DockerBuildOptions = {}): Promise<ImageInfo> {

    const opts = { ...defaultDockerBuildOptions, ...options };
    let nameTag: string | undefined;

    const args = ["build", "-f", dockerfile];
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

export interface File {
    path: string;
    contents: Buffer | string;
}

async function writeFiles(files: File[]) {
    await Promise.all(files.map(async (f) => {
        const contents = ld.isString(f.contents) ? Buffer.from(f.contents) : f.contents;
        return fs.writeFile(f.path, contents);
    }));
}

async function withTmpDir<T>(prefix: string, f: (tmpDir: string) => Promise<T> | T): Promise<T> {
    const tmpDir = await mkdtmp(prefix);
    try {
        return await f(tmpDir);
    } finally {
        await fs.remove(tmpDir);
    }
}

export interface LocalDockerBuildProps {
    dockerfile: string;
    contextDir: string;
    files?: File[];
    options?: DockerBuildOptions;
}

export function LocalDockerBuild(props: LocalDockerBuildProps) {
    const dockerfile = props.dockerfile || "Dockerfile";
    const image = useAsync(async () => {
        return withTmpDir("adapt-docker-build", async () => {
            await writeFiles(props.files ? props.files : []);
            const ret = await dockerBuild(dockerfile, props.contextDir, props.options);
            return ret;
        });
    }, undefined);

    useImperativeMethods(() => ({
        buildComplete: () => image !== undefined,
        ready: () => image !== undefined,
        image
    }));
    return null;
}

export interface DockerBuildStatus {
    buildObj: AdaptElement<DockerBuildOptions> | null;
    image?: ImageInfo;
}

export interface DockerBuildArgs {
    dockerfile: string;
    contextDir: string;
    options?: DockerBuildOptions;
    files?: File[];
}

export function useDockerBuild(prepare: () => Promise<DockerBuildArgs> | DockerBuildArgs): DockerBuildStatus;
export function useDockerBuild(
    dockerfile: string,
    contextDir: string,
    options?: DockerBuildOptions,
    files?: File[]): DockerBuildStatus;
export function useDockerBuild(
    prepOrFile: (() => Promise<DockerBuildArgs> | DockerBuildArgs) | string,
    contextDirIn?: string,
    optionsIn: DockerBuildOptions = {},
    filesIn: File[] = []
): DockerBuildStatus {
    const [buildState, setBuildState] = useState<ImageInfo | undefined>(undefined);

    const args = useAsync(async () => {
        if (ld.isFunction(prepOrFile)) return prepOrFile();
        return {
            dockerfile: prepOrFile,
            contextDir: contextDirIn ? contextDirIn : ".",
            options: optionsIn,
            files: filesIn
        };
    }, undefined);

    if (!args) return { buildObj: null };
    const opts = { ...defaultDockerBuildOptions, ...(args.options || {}) };
    if (!buildState) {
        const buildHand = handle();

        setBuildState(async () => {
            if (buildHand.mountedOrig && buildHand.mountedOrig.instance.buildComplete()) {
                return buildHand.mountedOrig.instance.image;
            }
            return undefined;
        });
        return {
            buildObj:
                <LocalDockerBuild
                    handle={buildHand}
                    dockerfile={args.dockerfile}
                    contextDir={args.contextDir}
                    files={args.files}
                    options={opts} />
        };
    }

    return { image: buildState, buildObj: null };
}
