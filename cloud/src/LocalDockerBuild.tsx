import execa from "execa";
import randomstring from "randomstring";

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

export async function dockerBuild(dockerfile: string, contextPath: string,
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
