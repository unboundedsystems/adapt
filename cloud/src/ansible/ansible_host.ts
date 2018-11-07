export interface AnsibleHostSsh {
    ansible_connection: "smart" | "ssh" | "paramiko";
    ansible_host: string;
    ansible_port?: number;
    ansible_user?: string;
    ansible_ssh_pass?: string;
    ansible_ssh_private_key?: string;
}

export interface AnsibleHostLocal {
    ansible_connection: "local";
}

export interface AnsibleHostDocker {
    ansible_connection: "docker";
    ansible_host?: string;
    ansible_user?: string;
    ansible_docker_extra_args?: string;
}

export type AnsibleHost =
    AnsibleHostSsh |
    AnsibleHostLocal |
    AnsibleHostDocker;

export const ansibleHostLocal: AnsibleHostLocal = {
    ansible_connection: "local"
};

export function isAnsibleHostSsh(host: AnsibleHost): host is AnsibleHostSsh {
    switch (host.ansible_connection) {
        case "smart":
        case "ssh":
        case "paramiko":
            return true;
        default:
            return false;
    }
}
