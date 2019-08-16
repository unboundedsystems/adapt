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

import Adapt, {
    BuiltinProps,
    childrenToArray,
    WithChildren,
} from "@adpt/core";
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
