import {
    NodeContainerBuildOptions,
    NodeContainerBuildStatus,
    useBuildNodeContainer,
} from "./useBuildNodeContainer";

export interface TypescriptBuildOptions extends NodeContainerBuildOptions { }

const defaultLocalTsBuildOptions = {
    imageName: "tsservice",
    runNpmScripts: "build",
};

export function useTypescriptBuild(srcDir: string,
    options: TypescriptBuildOptions = {}): NodeContainerBuildStatus {

    const opts = { ...defaultLocalTsBuildOptions, ...options };
    return useBuildNodeContainer(srcDir, opts);
}
