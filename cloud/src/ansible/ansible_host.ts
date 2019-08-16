/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface AnsibleHostSsh {
    ansible_connection: "smart" | "ssh" | "paramiko";
    ansible_host: string;
    ansible_port?: number;
    ansible_user?: string;
    ansible_become?: "yes";
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
