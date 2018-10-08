import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
    PrimitiveComponent,
} from "@usys/adapt";

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

export interface AnsiblePlaybookProps {
    ansibleHost: AnsibleHost;
    playbookFile: string;
    vars?: { [ key: string ]: any };
    /*
    name?: string;
    roles?: string[];
    environment?: { [ key: string ]: string };
    tasks?: any;
    timeout?: number; // seconds
    */
}

export class AnsiblePlaybook extends PrimitiveComponent<AnsiblePlaybookProps> {

}
export default AnsiblePlaybook;

export function isPlaybookPrimitiveElement(
    val: any): val is AdaptPrimitiveElement<AnsiblePlaybookProps> {
    return isPrimitiveElement(val) && val.componentType === AnsiblePlaybook;
}
