import Adapt, { BuiltinProps } from "@usys/adapt";
import { AnsibleHost } from "./ansible_host";
import AnsibleRole from "./AnsibleRole";

export interface AnsibleDockerHostProps extends Partial<BuiltinProps> {
    ansibleHost: AnsibleHost;
}

// tslint:disable-next-line:variable-name
export const AnsibleDockerHost = (props: AnsibleDockerHostProps) => (
    <AnsibleRole
        key={props.key}
        ansibleHost={props.ansibleHost}
        galaxy="nickjj.docker"
    />
);
