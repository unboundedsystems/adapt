import Adapt, { Component } from "@usys/adapt";
import { removeUndef } from "@usys/utils";
import { ContainerProps, Links, PortBinding, PortBindingString } from "../Container";
import { AnsiblePlaybook, Play } from "./AnsiblePlaybook";

export type AnsibleContainerProps = ContainerProps;

interface ContainerConfig {
    name: string;

    api_version?: any;
    auto_remove?: boolean;
    blkio_weight?: any;
    cacert_path?: any;
    cap_drop?: string[];
    capabilities?: string[];
    cert_path?: any;
    cleanup?: boolean;
    command?: string | string[];
    cpu_period?: any;
    cpu_quota?: any;
    cpu_shares?: any;
    cpuset_cpus?: any;
    cpuset_mems?: any;
    debug?: boolean;
    detach?: boolean;
    devices?: string[];
    dns_opts?: any;
    dns_search_domains?: any;
    dns_servers?: any;
    docker_host?: string;
    domainname?: string;
    entrypoint?: any;
    env?: { [ key: string ]: string };
    env_file?: string;
    etc_hosts?: { [ hostname: string ]: string };
    exposed_ports?: any;
    force_kill?: boolean;
    groups?: any;
    hostname?: string;
    ignore_image?: boolean;
    image?: string;
    init?: boolean;
    interactive?: boolean;
    ipc_mode?: any;
    keep_volumes?: boolean;
    kernel_memory?: any;
    key_path?: string;
    kill_signal?: any;
    labels?: any;
    links?: string[];
    log_driver?: string;
    mac_address?: string;
    memory?: string;
    memory_reservation?: any;
    memory_swap?: any;
    memory_swappiness?: any;
    network_mode?: string;
    networks?: any[];
    oom_killer?: boolean;
    oom_score_adj?: any;
    output_logs?: boolean;
    paused?: boolean;
    pid_mode?: any;
    privileged?: boolean;
    published_ports?: string[];
    pull?: boolean;
    purge_networks?: boolean;
    read_only?: boolean;
    recreate?: boolean;
    restart?: boolean;
    restart_policy?: "no" | "on-failure" | "always" | "unless-stopped";
    restart_retries?: any;
    security_opts?: any;
    shm_size?: any;
    ssl_version?: any;
    state?: "absent" | "present" | "stopped" | "started";
    stop_signal?: any;
    stop_timeout?: any;
    sysctls?: any;
    timeout?: number;
    tls?: boolean;
    tls_hostname?: string;
    tls_verify?: boolean;
    tmpfs?: any;
    trust_image_content?: boolean;
    tty?: boolean;
    ulimits?: any;
    user?: string;
    userns_mode?: any;
    uts?: any;
    volume_driver?: any;
    volumes?: string[];
    volumes_from?: string[];
    working_dir?: string;
}

export class AnsibleContainer extends Component<AnsibleContainerProps> {
    build() {
        const config: ContainerConfig = {
            name: this.props.name,

            auto_remove: this.props.autoRemove,
            command: this.props.command,
            docker_host: this.props.dockerHost,
            env: this.props.environment,
            image: this.props.image,
            interactive: this.props.stdinOpen,
            links: translateLinks(this.props.links),
            published_ports: translatePorts(this.props.portBindings),
            pull: true,
            state: "started",
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
}
export default AnsibleContainer;

function translatePorts(bindings: PortBinding | undefined): string[] | undefined {
    if (!bindings) return undefined;
    return Object.keys(bindings).map(
        (ctrPort) => `${(bindings as PortBindingString)[ctrPort]}:${ctrPort}`
    );
}

function translateLinks(links: Links | undefined): string[] | undefined {
    if (!links) return undefined;
    return Object.keys(links).map(
        (internalName) => `${links[internalName]}:${internalName}`
    );
}
