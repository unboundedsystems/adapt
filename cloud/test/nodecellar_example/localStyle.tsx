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

import Adapt, { Style } from "@adpt/core";

import {
    Compute, ComputeProps,
    Container, ContainerProps,
    DockerHost, DockerHostProps,
    LocalCompute, LocalContainer, LocalDockerHost,
} from "../../src";

const localStyle =
    <Style>
        {Compute} {Adapt.rule<ComputeProps>(({handle, ...props}) => {
            return <LocalCompute {...props}/>;
        })}

        {DockerHost} {Adapt.rule<DockerHostProps>((props, info) => {
            if (props.dockerHost) return info.origBuild(props);
            return <LocalDockerHost key={props.key}/>;
        })}

        {Container} {Adapt.rule<ContainerProps>(({handle, ...props}) => {
            return <LocalContainer {...props} />;
        })}
    </Style>;
export default localStyle;
