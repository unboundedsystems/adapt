import Adapt, {
    AdaptElement,
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState,
    waiting
} from "@usys/adapt";
import fs from "fs-extra";
import { isArray, isString } from "lodash";
import path from "path";
import { callInstanceMethod, getInstanceValue } from "./hooks";
import { DockerBuildOptions, ImageInfo, useDockerBuild } from "./LocalDockerBuild";

export interface LocalNodeContainerProps extends Partial<BuiltinProps> {
    srcDir: string;
    options?: NodeContainerBuildOptions;
}

export function LocalNodeContainer(props: LocalNodeContainerProps) {
    const { image, buildObj } = useDockerBuild(
        async () => {
            const srcDir = path.resolve(props.srcDir);
            if (!(await fs.pathExists(srcDir))) throw new Error(`Source directory ${srcDir} not found`);
            const pkgInfo = await fs.readJson(path.join(srcDir, "package.json"));
            const main = pkgInfo.main ? pkgInfo.main : "index.js";
            const runNpmScripts = props.options && props.options.runNpmScripts;
            const scripts =
                isArray(runNpmScripts) ? runNpmScripts :
                isString(runNpmScripts) ?  [ runNpmScripts ] :
                [];
            const runCommands = scripts.map((s) => `RUN npm run ${s}`).join("\n");
            return {
                dockerfile: `
                    FROM node:10-stretch-slim
                    WORKDIR /app
                    ADD . /app
                    RUN npm install
                    ${runCommands}
                    CMD ["node", "${main}"]
                `,
                contextDir: srcDir,
                options: props.options,
            };
        });

    useImperativeMethods(() => ({
        buildComplete: () => image !== undefined,
        ready: () => image !== undefined,
        image,
        deployedWhen: () => {
            if (image !== undefined) return true;
            return waiting("Waiting for Node container image to build");
        }
    }));
    return buildObj;
}

export interface NodeContainerBuildOptions extends DockerBuildOptions {
    runNpmScripts?: string | string[];
}

const defaultContainerBuildOptions = {
    imageName: "node-service",
    uniqueTag: true,
};

export interface NodeContainerBuildStatus {
    buildObj: AdaptElement<NodeContainerBuildOptions>;
    image?: ImageInfo;
}

export function useBuildNodeContainer(srcDir: string,
    options: NodeContainerBuildOptions = {}): NodeContainerBuildStatus {

    const opts = { ...defaultContainerBuildOptions, ...options };
    const [buildState, setBuildState] = useState<ImageInfo | undefined>(undefined);

    const buildHand = handle();
    const buildObj = <LocalNodeContainer handle={buildHand} srcDir={srcDir} options={opts} />;

    if (!buildState) {
        setBuildState(async () => {
            if (callInstanceMethod(buildHand, false, "buildComplete")) {
                return getInstanceValue(buildHand, undefined, "image");
            }
            return undefined;
        });
    }

    return { image: buildState, buildObj };
}
