import Adapt, { Component, ObserveForStatus } from "@usys/adapt";
import { FIXME_NeedsProperType, removeUndef } from "@usys/utils";
import { Container, ContainerProps, Links, PortBinding } from "../Container";
import { containerStatus } from "../docker/Container";
import { AnsiblePlaybook, Play } from "./AnsiblePlaybook";

export type AnsibleContainerProps = ContainerProps;

interface ContainerConfig {
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
    docker_host?: string;
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

export class AnsibleContainer extends Component<AnsibleContainerProps> {
    static defaultProps = Container.defaultProps;

    build() {
        const config: ContainerConfig = {
            name: this.props.name,

            auto_remove: this.props.autoRemove,
            command: this.props.command,
            docker_host: translateDockerHost(this.props.dockerHost),
            env: this.props.environment,
            image: this.props.image,
            interactive: this.props.stdinOpen,
            links: translateLinks(this.props.links),
            published_ports: translatePorts(this.props.portBindings),
            pull: true,
            state: "started",
            stop_signal: this.props.stopSignal,
            tty: this.props.tty,
            working_dir: this.props.workingDir,
        };
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
                        name: `Create docker container ${this.props.name}`,
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

    async status(observe: ObserveForStatus) {
        return containerStatus(observe, this.props.name, this.props.dockerHost);
    }
}
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
