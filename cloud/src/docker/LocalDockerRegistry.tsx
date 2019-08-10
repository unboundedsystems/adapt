import Adapt, { SFCBuildProps, SFCDeclProps } from "@adpt/core";
import { DockerContainer } from "./DockerContainer";
import { DockerContainerProps, ImageNameString } from "./types";

/**
 * Props for {@link docker.LocalDockerRegistry}
 * @public
 */
export interface LocalDockerRegistryProps extends DockerContainerProps {
    image: ImageNameString;
}

const defaultProps = {
    dockerHost: process.env.DOCKER_HOST,
    image: "registry:2",
};

/**
 * Runs a Docker registry in a container.
 * @public
 */
export function LocalDockerRegistry(props: SFCDeclProps<LocalDockerRegistryProps, typeof defaultProps>) {
    const { handle, ...buildProps } =
        props as SFCBuildProps<LocalDockerRegistryProps, typeof defaultProps>;
    return <DockerContainer {...buildProps} />;
}
(LocalDockerRegistry as any).defaultProps = defaultProps;
