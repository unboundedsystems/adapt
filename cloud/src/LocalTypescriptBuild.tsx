import Adapt, {
    AdaptElement,
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState
} from "@usys/adapt";
import { mkdtmp } from "@usys/utils";
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
        ready: () => image !== undefined,
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
