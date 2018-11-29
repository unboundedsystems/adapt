import Adapt, {
    BuiltinProps,
    childrenToArray,
    WithChildren,
} from "@usys/adapt";
import { AnsibleHost } from "./ansible_host";
import AnsibleRole from "./AnsibleRole";

export interface AnsibleDockerHostProps extends Partial<BuiltinProps>, WithChildren {
    ansibleHost: AnsibleHost;
}

// tslint:disable-next-line:variable-name
export const AnsibleDockerHost = (props: AnsibleDockerHostProps) => {
    const { handle, children, ...newProps } = props;
    const kids = childrenToArray(children);

    return <AnsibleRole
        {...newProps}
        ansibleHost={props.ansibleHost}
        galaxy="geerlingguy.docker"
    >
        {...kids}

        <AnsibleRole
            ansibleHost={props.ansibleHost}
            galaxy="robertdebock.python_pip"
            vars={{
                python_pip_modules: [ { name: "docker" } ]
            }}
        />
    </AnsibleRole>;
};
