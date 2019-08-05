import Adapt, {
    BuiltinProps,
    callInstanceMethod,
    handle,
    useImperativeMethods,
    useInstanceValue,
    useState,
} from "@adpt/core";
import fs from "fs-extra";
import { isArray, isString } from "lodash";
import path from "path";
import { DockerBuildOptions, LocalDockerImage, LocalDockerImageProps } from "../docker";

/**
 * Props for {@link nodejs.LocalNodeImage}
 *
 * @public
 */
export interface LocalNodeImageProps extends Partial<BuiltinProps> {
    /** Source directory for the Node.js program */
    srcDir: string;
    /** Build options */
    options?: NodeImageBuildOptions;
}

/**
 * Locally builds a docker image for a {@link https://www.nodejs.org | Node.js} program.
 *
 * @remarks
 * See {@link nodejs.LocalNodeImageProps}.
 *
 * @public
 */
export function LocalNodeImage(props: LocalNodeImageProps) {
    const opts = { ...defaultContainerBuildOptions, ...(props.options || {}) };
    const [imgProps, setImgProps] = useState<LocalDockerImageProps | undefined>(undefined);
    const img = handle();

    setImgProps(async () => {
        const srcDir = path.resolve(props.srcDir);
        if (!(await fs.pathExists(srcDir))) throw new Error(`Source directory ${srcDir} not found`);
        const pkgInfo = await fs.readJson(path.join(srcDir, "package.json"));
        const main = pkgInfo.main ? pkgInfo.main : "index.js";
        const runNpmScripts = opts.runNpmScripts;
        const scripts =
            isArray(runNpmScripts) ? runNpmScripts :
                isString(runNpmScripts) ? [runNpmScripts] :
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

    const image = useInstanceValue(img, undefined, "image");
    useImperativeMethods(() => ({
        latestImage: () => callInstanceMethod(img, undefined, "latestImage"),
        image
    }));

    return imgProps ? <LocalDockerImage handle={img} {...imgProps} /> : null;
}

/**
 * Options controlling how the Docker image is built in
 * {@link nodejs.LocalNodeImage}.
 * @public
 */
export interface NodeImageBuildOptions extends DockerBuildOptions {
    /**
     * Package manager to use in build steps in the generated Dockerfile
     * that builds {@link nodejs.LocalNodeImage}.
     */
    packageManager?: "npm" | "yarn" | string;
    /**
     * Scripts that are defined in your
     * {@link https://docs.npmjs.com/files/package.json | package.json file}
     * that should be run during the image build.
     */
    runNpmScripts?: string | string[];
}

const defaultContainerBuildOptions = {
    imageName: "node-service",
    packageManager: "npm",
    uniqueTag: true,
};
