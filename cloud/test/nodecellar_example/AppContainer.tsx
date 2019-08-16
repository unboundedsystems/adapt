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

import Adapt, { Component } from "@adpt/core";
import { Container, ImageId } from "../../src";

export interface Props {
    mongoHostname: string;
    mongoPort: number;
    dockerHost: string;

    name?: string;
    ctrPort?: number;
    port?: number;
    image?: ImageId;
}

export default class AppContainer extends Component<Props, {}> {
    static defaultProps = {
        name: "nodecellar",
        ctrPort: 8080,
        port: 8080,
        image: {
            repository: "uric/nodecellar"
        }
    };

    build() {
        const props = this.props;

        return (
            <Container
                name={props.name!}
                dockerHost={props.dockerHost!}
                image={props.image!}
                ports={[ props.ctrPort! ]}
                stdinOpen={true}
                tty={true}
                command="nodejs server.js"
                environment={{
                    NODECELLAR_PORT: props.ctrPort!.toString(),
                    MONGO_PORT: props.mongoPort.toString(),
                    MONGO_HOST: props.mongoHostname,
                }}
                links={{
                    mongod: props.mongoHostname,
                }}
                portBindings={{
                    // ctr port : host port
                    [props.ctrPort!]: props.port!,
                }}
            />
        );
    }
}
