import Adapt, {
    handle,
    SFCBuildProps,
    SFCDeclProps,
    useDeployedWhen,
    useImperativeMethods,
    useMethod,
    waiting,
} from "@adpt/core";
import { ExcludeKeys } from "@adpt/utils";
import { busyboxImage, dockerRun } from "./cli";
import { DockerContainer } from "./DockerContainer";
import { DockerContainerProps, NameTagString, RegistryString } from "./types";

/**
 * Props for {@link docker.LocalDockerRegistry}
 * @public
 */
export interface LocalDockerRegistryProps extends ExcludeKeys<DockerContainerProps, "image"> {
    /**
     * Tag to use for official Docker Hub `registry` image repo.
     */
    imageTag: NameTagString;
    /**
     * Port number to expose for the registry HTTP server.
     */
    port: number;
}

const defaultProps = {
    dockerHost: process.env.DOCKER_HOST,
    imageTag: "2",
    port: 5000,
};

export interface DockerRegistryInstance {
    registry(): RegistryString | undefined;
}

/**
 * Runs a Docker registry in a container.
 * @remarks
 * Implements {@link docker.DockerRegistryInstance}.
 *
 * @public
 */
export function LocalDockerRegistry(props: SFCDeclProps<LocalDockerRegistryProps, typeof defaultProps>) {
    const { handle: _h, imageTag, port, ...buildProps } =
        props as SFCBuildProps<LocalDockerRegistryProps, typeof defaultProps>;
    const ctr = handle();

    const dockerHost = buildProps.dockerHost;
    const image = `registry:${imageTag}`;

    const ipAddr = useMethod<string | undefined>(ctr, undefined, "dockerIP");

    function registry() {
        if (!ipAddr) return undefined;
        return `${ipAddr}:${props.port}`;
    }

    useDeployedWhen(async () => {
        let reason: string;
        if (ipAddr) {
            try {
                await dockerRun({
                    autoRemove: true,
                    background: false,
                    image: busyboxImage,
                    dockerHost,
                    command: [ "wget", "--spider", `http://${registry()}/v2/`],
                });
                return true;
            } catch (err) {
                reason = err.message;
            }
        } else {
            reason = "No IP address for container";
        }
        return waiting(`Waiting for registry to become ready (${reason})`);
    });

    useImperativeMethods<DockerRegistryInstance>(() => ({
        registry,
    }));

    return <DockerContainer handle={ctr} image={image} {...buildProps} />;
}
(LocalDockerRegistry as any).defaultProps = defaultProps;
