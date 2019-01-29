import Adapt, {
    AdaptElement,
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState
} from "@usys/adapt";
import fs from "fs-extra";
import path from "path";
import { DockerBuildOptions, ImageInfo, useDockerBuild } from "./LocalDockerBuild";

export interface TypescriptBuildProps extends Partial<BuiltinProps> {
    srcDir: string;
    options?: TypescriptBuildOptions;
}

function LocalTypescriptBuild(props: TypescriptBuildProps) {
    const { image, buildObj } = useDockerBuild(
        async () => {
            const srcDir = path.resolve(props.srcDir);
            if (!(await fs.pathExists(srcDir))) throw new Error(`Source directory ${srcDir} not found`);
            const pkgInfo = await fs.readJson(path.join(srcDir, "package.json"));
            const main = pkgInfo.main ? pkgInfo.main : "index.js";
            return {
                dockerfile: "Dockerfile",
                contextDir: srcDir,
                options: props.options,
                files: [{
                    path: "Dockerfile",
                    contents: `FROM node:10-alpine
WORKDIR /app
ADD . /app
RUN npm install
RUN npm run build
CMD ["node", "${main}"]`
                }]
            };
        });

    useImperativeMethods(() => ({
        buildComplete: () => image !== undefined,
        ready: () => image !== undefined,
        image
    }));
    return buildObj;
}

export interface TypescriptBuildOptions extends DockerBuildOptions { }

const defaultLocalTsBuildOptions = {
    imageName: "tsservice",
    uniqueTag: true,
};

export interface TypescriptBuildStatus {
    buildObj: AdaptElement<TypescriptBuildOptions> | null;
    image?: ImageInfo;
}

export function useTypescriptBuild(srcDir: string,
    options: TypescriptBuildOptions = {}): TypescriptBuildStatus {

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
