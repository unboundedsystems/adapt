import Adapt, { GoalStatus, ObserveForStatus, SFCBuildProps, SFCDeclProps, useDeployedWhen, waiting } from "@adpt/core";
import { FIXME_NeedsProperType, removeUndef } from "@adpt/utils";
import {
    Container as AbsContainer,
    ContainerProps as AbsContainerProps,
    Links,
    mergeEnvSimple,
    PortBinding,
    useLatestImageFrom,
} from "../Container";
import { containerStatus } from "../docker/DockerContainer";
import { AnsiblePlaybook, Play } from "./AnsiblePlaybook";

/**
 * Props for an {@link ansible.AnsibleContainer}.
 * @public
 */
export interface AnsibleContainerProps extends SFCDeclProps<ContainerConfig> {
}

/**
 * Ansible native container configuration.
 * @public
 */
export interface ContainerConfig {
    name: string;

    api_version?: FIXME_NeedsProperType;
    auto_remove?: boolean;
    blkio_weight?: FIXME_NeedsProperType;
    cacert_path?: FIXME_NeedsProperType;
    cap_drop?: string[];
    capabilities?: string[];
    cert_path?: FIXME_NeedsProperType;
    cleanup?: boolean;
    command?: string | string[];
    cpu_period?: FIXME_NeedsProperType;
    cpu_quota?: FIXME_NeedsProperType;
    cpu_shares?: FIXME_NeedsProperType;
    cpuset_cpus?: FIXME_NeedsProperType;
    cpuset_mems?: FIXME_NeedsProperType;
    debug?: boolean;
    detach?: boolean;
    devices?: string[];
    dns_opts?: FIXME_NeedsProperType;
    dns_search_domains?: FIXME_NeedsProperType;
    dns_servers?: FIXME_NeedsProperType;
    docker_host: string;
    domainname?: string;
    entrypoint?: FIXME_NeedsProperType;
    env?: { [ key: string ]: string };
    env_file?: string;
    etc_hosts?: { [ hostname: string ]: string };
    exposed_ports?: FIXME_NeedsProperType;
    force_kill?: boolean;
    groups?: FIXME_NeedsProperType;
    hostname?: string;
    ignore_image?: boolean;
    image?: string;
    init?: boolean;
    interactive?: boolean;
    ipc_mode?: FIXME_NeedsProperType;
    keep_volumes?: boolean;
    kernel_memory?: FIXME_NeedsProperType;
    key_path?: string;
    kill_signal?: FIXME_NeedsProperType;
    labels?: FIXME_NeedsProperType;
    links?: string[];
    log_driver?: string;
    mac_address?: string;
    memory?: string;
    memory_reservation?: FIXME_NeedsProperType;
    memory_swap?: FIXME_NeedsProperType;
    memory_swappiness?: FIXME_NeedsProperType;
    network_mode?: string;
    networks?: FIXME_NeedsProperType[];
    oom_killer?: boolean;
    oom_score_adj?: FIXME_NeedsProperType;
    output_logs?: boolean;
    paused?: boolean;
    pid_mode?: FIXME_NeedsProperType;
    privileged?: boolean;
    published_ports?: string[];
    pull?: boolean;
    purge_networks?: boolean;
    read_only?: boolean;
    recreate?: boolean;
    restart?: boolean;
    restart_policy?: "no" | "on-failure" | "always" | "unless-stopped";
    restart_retries?: FIXME_NeedsProperType;
    security_opts?: FIXME_NeedsProperType;
    shm_size?: FIXME_NeedsProperType;
    ssl_version?: FIXME_NeedsProperType;
    state?: "absent" | "present" | "stopped" | "started";
    stop_signal?: FIXME_NeedsProperType;
    stop_timeout?: FIXME_NeedsProperType;
    sysctls?: FIXME_NeedsProperType;
    timeout?: number;
    tls?: boolean;
    tls_hostname?: string;
    tls_verify?: boolean;
    tmpfs?: FIXME_NeedsProperType;
    trust_image_content?: boolean;
    tty?: boolean;
    ulimits?: FIXME_NeedsProperType;
    user?: string;
    userns_mode?: FIXME_NeedsProperType;
    uts?: FIXME_NeedsProperType;
    volume_driver?: FIXME_NeedsProperType;
    volumes?: string[];
    volumes_from?: string[];
    working_dir?: string;
}

/**
 * Ansible-specific defintion of a container.
 * @public
 */
export function AnsibleContainer(props: AnsibleContainerProps) {
    const { handle: h, key, ...config } = props as SFCBuildProps<AnsibleContainerProps>;

    const plays: Play[] = [
        {
            hosts: "localhost",
            // TODO(mark): Remove the roles from here when we have
            // ability to place a dependency on AnsibleDockerHost, which
            // should install these roles.
            roles: [
                "geerlingguy.docker",
                "robertdebock.python_pip",
            ],
            tasks: [
                {
                    name: `Create docker container ${props.name}`,
                    docker_container: removeUndef(config),
                }
            ],
            vars: {
                python_pip_modules: [ { name: "docker" } ]
            }
        }
    ];
    return <AnsiblePlaybook playbookPlays={plays} />;
}

(AnsibleContainer as any).status =
    (props: AnsibleContainerProps, observe: ObserveForStatus) => {
    return containerStatus(observe, props.name, props.docker_host);
};
export default AnsibleContainer;

function translatePorts(bindings: PortBinding | undefined): string[] | undefined {
    if (!bindings) return undefined;
    return Object.keys(bindings).map(
        (ctrPort) => `${bindings[ctrPort]}:${ctrPort}`
    );
}

function translateLinks(links: Links | undefined): string[] | undefined {
    if (!links) return undefined;
    return Object.keys(links).map(
        (internalName) => `${links[internalName]}:${internalName}`
    );
}

function translateDockerHost(dockerHost: string): string {
    if (dockerHost.startsWith("file://")) return "unix://" + dockerHost.slice(7);
    return dockerHost;
}

/**
 * Props for {@link ansible.Container}.
 * @public
 */
export interface ContainerProps extends SFCDeclProps<AbsContainerProps, typeof AbsContainer.defaultProps> {
    /**
     * Additional {@link ansible.AnsibleContainerProps}-specific props that
     * should be added to the instantiated {@link ansible.AnsibleContainer}.
     */
    ansibleContainerProps?: Partial<AnsibleContainerProps>;
}

/**
 * Component that implements the abstract {@link Container} interface and
 * translates to an Ansible-specific {@link ansible.AnsibleContainer}.
 * @public
 */
export function Container(props: ContainerProps) {
    const bProps = props as SFCBuildProps<AbsContainerProps, typeof AbsContainer.defaultProps>;
    const image = useLatestImageFrom(bProps.image);

    useDeployedWhen((gs) => {
        if (gs === GoalStatus.Destroyed || image) return true;
        return waiting("Waiting for Docker image");
    });

    if (!image) return null;

    const config: ContainerConfig = {
        name: bProps.name,

        auto_remove: bProps.autoRemove,
        command: bProps.command,
        docker_host: translateDockerHost(bProps.dockerHost),
        env: mergeEnvSimple(bProps.environment),
        image,
        interactive: bProps.stdinOpen,
        links: translateLinks(bProps.links),
        published_ports: translatePorts(bProps.portBindings),
        pull: true,
        state: "started",
        stop_signal: bProps.stopSignal,
        tty: bProps.tty,
        working_dir: bProps.workingDir,
    };
    return <AnsibleContainer {...config} {...props.ansibleContainerProps || {}} />;
}
(Container as any).defaultProps = AbsContainer.defaultProps;
(Container as any).displayName = "ansible.Container";
