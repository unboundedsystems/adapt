import Adapt, {
    AdaptElement,
    BuiltinProps,
    handle,
    useImperativeMethods,
    useState,
    waiting
} from "@adpt/core";
import fs from "fs-extra";
import { isArray, isString } from "lodash";
import path from "path";
import { getInstanceValue } from "../hooks";
import { DockerBuildOptions, ImageInfo, useDockerBuild } from "../LocalDockerBuild";

export interface LocalNodeContainerProps extends Partial<BuiltinProps> {
    srcDir: string;
    options?: NodeContainerBuildOptions;
}

export function LocalNodeContainer(props: LocalNodeContainerProps) {
    const opts = { ...defaultContainerBuildOptions, ...(props.options || {})};

    const { image, buildObj } = useDockerBuild(
        async () => {
            const srcDir = path.resolve(props.srcDir);
            if (!(await fs.pathExists(srcDir))) throw new Error(`Source directory ${srcDir} not found`);
            const pkgInfo = await fs.readJson(path.join(srcDir, "package.json"));
            const main = pkgInfo.main ? pkgInfo.main : "index.js";
            const runNpmScripts = opts.runNpmScripts;
            const scripts =
                isArray(runNpmScripts) ? runNpmScripts :
                isString(runNpmScripts) ?  [ runNpmScripts ] :
                [];
            const runCommands =
                scripts.map((s) => `RUN ${opts.packageManager} run ${s}`).join("\n");
            return {
                dockerfile: `
                    FROM node:10-stretch-slim
                    WORKDIR /app
                    ADD . /app
                    RUN ${opts.packageManager} install
                    ${runCommands}
                    CMD ["node", "${main}"]
                `,
                contextDir: srcDir,
                options: opts,
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
    packageManager?: "npm" | "yarn" | string;
    runNpmScripts?: string | string[];
}

const defaultContainerBuildOptions = {
    imageName: "node-service",
    packageManager: "npm",
    uniqueTag: true,
};

export interface NodeContainerBuildStatus {
    buildObj: AdaptElement<NodeContainerBuildOptions>;
    image?: ImageInfo;
}

export function useBuildNodeContainer(srcDir: string,
    options: NodeContainerBuildOptions = {}): NodeContainerBuildStatus {

    const [buildState, setBuildState] = useState<ImageInfo | undefined>(undefined);

    const buildHand = handle();
    const buildObj = <LocalNodeContainer handle={buildHand} srcDir={srcDir} options={options} />;

    setBuildState(async () =>
        buildHand.mountedOrig ? getInstanceValue(buildHand, undefined, "image") : undefined);

    return { image: buildState, buildObj };
}
