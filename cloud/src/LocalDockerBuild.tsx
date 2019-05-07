import Adapt, {
    AdaptElement,
    ChangeType,
    DeployOpID,
    DeployStatus,
    GoalStatus,
    handle,
    useState,
    waiting,
} from "@usys/adapt";
import { InternalError, withTmpDir } from "@usys/utils";
import db from "debug";
import execa from "execa";
import fs from "fs-extra";
import stringify from "json-stable-stringify";
import ld from "lodash";
import * as path from "path";
import randomstring from "randomstring";
import { WithPartialT } from "type-ops";
import { Action, ActionContext, ShouldAct } from "./action";
import { useAsync } from "./hooks";

export interface ImageInfo {
    id: string;
    nameTag?: string;
}

export interface DockerGlobalOptions {
    dockerHost?: string;
}

export const pickGlobals = (opts: DockerGlobalOptions): DockerGlobalOptions =>
    ld.pick(opts, "dockerHost");

const debug = db("adapt:cloud:docker");

interface ExecDockerOptions extends DockerGlobalOptions {
    stdin?: string;
}

async function execDocker(args: string[], options: ExecDockerOptions) {
    const globalArgs = [];
    if (options.dockerHost) globalArgs.push("-H", options.dockerHost);

    args = globalArgs.concat(args);
    const opts = options.stdin ? { input: options.stdin } : undefined;

    debug(`Running: ${"docker " + args.join(" ")}`);
    const ret = execa("docker", args, opts);
    //ret.then((r) => debug(`${cmdline} stdout:\n${r.stdout}\n${cmdline} stderr:\n${r.stderr}`));
    return ret;
}

export interface DockerBuildOptions extends DockerGlobalOptions {
    forceRm?: boolean;
    imageName?: string;
    imageTag?: string;
    prevUniqueTag?: string;
    stdin?: string;
    /**
     * If true and the newly built image ID does not match the image ID for
     * prevUniqueTag (or prevUniqeTag is not set), a new unique nameTag is
     * generated for this image (from imageName and imageTag).
     * If true and the newly built image ID does match the image ID for
     * prevUniqueTag, then prevUniqueTag is returned as nameTag.
     * If false, imageName and imageTag are used without modification.
     */
    uniqueTag?: boolean;
}

const defaultDockerBuildOptions = {
    forceRm: true,
    uniqueTag: false,
};

export async function dockerBuild(
    dockerfile: string,
    contextPath: string,
    options: DockerBuildOptions = {}): Promise<ImageInfo> {

    const opts = { ...defaultDockerBuildOptions, ...options };
    let nameTag: string | undefined;

    const args = ["build", "-f", dockerfile];

    if (dockerfile === "-" && !opts.stdin) {
        throw new Error(`dockerBuild: stdin option must be set if dockerfile is "-"`);
    }

    if (opts.forceRm) args.push("--force-rm");
    if (opts.uniqueTag && !opts.imageName) {
        throw new Error(`dockerBuild: imageName must be set if uniqueTag is true`);
    }
    if (opts.imageName) {
        const tag = createTag(opts.imageTag, opts.uniqueTag);
        nameTag = tag ? `${opts.imageName}:${tag}` : opts.imageName;
        if (!opts.uniqueTag) args.push("-t", nameTag);
    }
    args.push(contextPath);

    const cmdRet = await execDocker(args, opts);
    const { stdout, stderr } = cmdRet;
    if (debug.enabled) debugBuild(cmdRet);

    const match = /^Successfully built ([0-9a-zA-Z]+)$/mg.exec(stdout);
    if (!match || !match[1]) throw new Error("Could not extract image sha\n" + stdout + "\n\n" + stderr);

    const id = await dockerImageId(match[1], opts);
    if (id == null) throw new Error(`Built image ID not found`);

    if (opts.uniqueTag) {
        const prevId = opts.prevUniqueTag && await dockerImageId(opts.prevUniqueTag, opts);
        if (prevId === id) nameTag = opts.prevUniqueTag; // prev points to current id
        else {
            if (!nameTag) throw new InternalError(`nameTag not set`);
            await dockerTag(id, nameTag, opts);
        }
    }

    const ret: ImageInfo = { id };
    if (nameTag) ret.nameTag = nameTag;
    return ret;
}

function debugBuild(cmdRet: execa.ExecaReturns) {
    const steps: string[] = [];
    let cur = "";
    cmdRet.stdout.split("\n").forEach((l) => {
        if (l.startsWith("Step")) {
            if (cur) steps.push(cur);
            cur = l;
        } else if (l.startsWith(" ---> ")) {
            cur += l;
        }
    });
    if (cur) steps.push(cur);
    const cached = cur.includes("Using cache");
    debug(`docker ${cmdRet.cmd}:\n  Cached: ${cached}\n  ${steps.join("\n  ")}`);
}

async function dockerImageId(name: string, opts: DockerGlobalOptions = {}): Promise<string | undefined> {
    const inspectRet = await execDocker(["inspect", name], opts);
    try {
        const inspect = JSON.parse(inspectRet.stdout);
        if (!Array.isArray(inspect)) throw new Error(`Image inspect result is not an array`);
        if (inspect.length > 1) throw new Error(`Multiple images found`);
        if (inspect.length === 0) return undefined;

        return inspect[0].Id;

    } catch (err) {
        throw new Error(`Error inspecting image ${name}: ${err.message}`);
    }
}

async function dockerTag(existing: string, newTag: string, opts: DockerGlobalOptions = {}) {
    return execDocker([ "tag", existing, newTag ], opts);
}

interface DockerRemoveImageOptions extends DockerGlobalOptions {
    force?: boolean;
}

const dockerRemoveImageDefaults = {
    force: false,
};

async function dockerRemoveImage(
    idOrNameTag: string, options: DockerRemoveImageOptions = {}) {

    const opts = { ...dockerRemoveImageDefaults, ...options };

    const args = [ "rmi" ];
    if (opts.force) args.push("--force");
    args.push(idOrNameTag);

    return execDocker(args, opts);
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

async function writeFiles(pwd: string, files: File[]) {
    // Strip any leading slash
    files = files.map((f) => {
        return f.path.startsWith("/") ?
            { path: f.path.slice(1), contents: f.contents } :
            f;
    });
    // Make any directories required
    const dirs = ld.uniq(files
        .map((f) => path.dirname(f.path))
        .filter((d) => d !== "."));
    await Promise.all(dirs.map(async (d) => fs.mkdirp(path.resolve(pwd, d))));

    await Promise.all(files.map(async (f) => {
        const contents = ld.isString(f.contents) ? Buffer.from(f.contents) : f.contents;
        return fs.writeFile(path.resolve(pwd, f.path), contents);
    }));
}

export async function buildFilesImage(files: File[], opts: DockerGlobalOptions) {
    const dockerfile = `
        FROM scratch
        COPY . /
        `;
    return withTmpDir(async (dir) => {
        await writeFiles(dir, files);
        return dockerBuild("-", dir, {
            ...pickGlobals(opts),
            forceRm: true,
            imageName: "adapt-tmp-files",
            uniqueTag: true,
            stdin: dockerfile,
        });
    }, { prefix: "adapt-docker-build" });
}

export async function withFilesImage<T>(files: File[] | undefined,
    opts: DockerGlobalOptions,
    fn: (img: ImageInfo | undefined) => T | Promise<T>): Promise<T> {

    if (!files || files.length === 0) return fn(undefined);

    const image = await buildFilesImage(files, opts);
    try {
        return await fn(image);
    } finally {
        await dockerRemoveImage(image.id, opts);
    }
}

export interface Stage {
    image: string;
    name: string;
}

export interface LocalDockerImageProps {
    contextDir?: string;
    dockerfile?: string;      // contents of Dockerfile
    dockerfileName?: string;  // path to Dockerfile
    files?: File[];
    options: DockerBuildOptions;
    stages?: Stage[];
}

export interface LocalDockerImageState {
    deployOpID?: DeployOpID;
    image?: ImageInfo;
    imagePropsJson?: string;
    prevUniqueTag?: string;
}

export class LocalDockerImage extends Action<LocalDockerImageProps, LocalDockerImageState> {
    static defaultProps = {
        options: {},
    };

    image_?: ImageInfo;
    imagePropsJson_?: string;

    constructor(props: LocalDockerImageProps) {
        super(props);
        if (!props.dockerfile && !props.dockerfileName) {
            throw new Error(`LocalDockerImage: one of dockerfile or ` +
                `dockerfileName must be given`);
        }
    }

    /*
     * Public instance properties/methods
     */
    buildComplete() { return this.image != null; }
    ready() { return this.buildComplete(); }

    get image() {
        if (this.image_ == null) {
            if (this.state.image != null &&
                // Ensure we've rebuilt at least once this OpID
                this.state.deployOpID === this.deployInfo.deployOpID &&
                // And ensure the current build matches current props
                this.state.imagePropsJson === this.imagePropsJson) {

                this.image_ = this.state.image;
            }
        }
        return this.image_;
    }

    /*
     * Implementations for Action base class
     */
    async shouldAct(op: ChangeType): Promise<ShouldAct> {
        let imgName = this.props.options.imageName || "";
        if (imgName) imgName = ` '${imgName}'`;

        if (op === ChangeType.delete) return false;

        if (this.buildComplete()) return false;
        return {
            act: true,
            detail: `Building Docker image${imgName}`,
        };
    }

    async action(op: ChangeType, _ctx: ActionContext) {
        const { options } = this.props;
        const prevUniqueTag = this.state.prevUniqueTag;

        if (op === ChangeType.delete) {
            throw new InternalError(`Delete action should not happen due to check in shouldAct`);
        }

        let dockerfile = this.props.dockerfile;
        if (!dockerfile) {
            if (!this.props.dockerfileName) {
                throw new InternalError(`dockerfileName should not be null`);
            }
            dockerfile = (await fs.readFile(this.props.dockerfileName)).toString();
        }

        const stages = this.props.stages || [];

        const image = await withFilesImage(this.props.files, options, async (img) => {
            if (img) stages.push({ image: img.id, name: "files" });

            const stageConfig = stages
                .map((s) => `FROM ${s.image} as ${s.name}`)
                .join("\n");
            if (stageConfig) {
                dockerfile = `${stageConfig}\n\n${dockerfile}`;
            }

            let contextDir = this.props.contextDir || ".";
            contextDir = path.resolve(contextDir);
            return dockerBuild("-", contextDir, {
                ...options,
                prevUniqueTag,
                stdin: dockerfile,
            });
        });

        this.image_ = image;
        this.setState({
            deployOpID: this.deployInfo.deployOpID,
            image,
            imagePropsJson: this.imagePropsJson,
            prevUniqueTag: options.uniqueTag ? image.nameTag : undefined,
        });
    }

    /*
     * Component methods
     */

    initialState() { return {}; }

    deployedWhen = (goalStatus: GoalStatus) => {
        if (goalStatus === DeployStatus.Destroyed) return true;
        if (this.buildComplete()) return true;

        if (this.state.imagePropsJson &&
            this.state.imagePropsJson !== this.imagePropsJson) {
            return waiting("Waiting for Docker image to be re-built");
        }
        return waiting("Waiting for Docker image to be built");
    }

    protected get imagePropsJson() {
        if (!this.imagePropsJson_) {
            const { handle: _h, key, ...imageProps } = this.props;
            this.imagePropsJson_ = stringify(imageProps);
        }
        return this.imagePropsJson_;
    }
}

export interface DockerBuildStatus {
    buildObj: AdaptElement | null;
    image?: ImageInfo;
}

// Make options optional
export type DockerBuildArgs = WithPartialT<LocalDockerImageProps, "options">;

export function useDockerBuild(
    prepOrArgs: (() => Promise<DockerBuildArgs> | DockerBuildArgs) | DockerBuildArgs,
): DockerBuildStatus {
    const [buildState, setBuildState] = useState<ImageInfo | undefined>(undefined);

    const args = useAsync(async () => {
        if (ld.isFunction(prepOrArgs)) return prepOrArgs();
        return prepOrArgs;
    }, undefined);

    if (!args) return { buildObj: null };
    const opts = { ...defaultDockerBuildOptions, ...(args.options || {}) };
    const buildHand = handle();
    const buildObj =
        <LocalDockerImage
            handle={buildHand}
            {...args}
            options={opts} />;

    setBuildState(async () => buildHand.mountedOrig && buildHand.mountedOrig.instance.image);

    return { image: buildState, buildObj };
}
