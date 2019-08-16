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
    dockerHost: string;
    name?: string;
    mongoCtrPort?: number;
    webStatusCtrPort?: number;
    mongoPort?: number;
    webStatusPort?: number;
    image?: ImageId;
}

export default class MongoContainer extends Component<Props, {}> {
    static defaultProps = {
        name: "mongod",
        mongoCtrPort: 27017,
        webStatusCtrPort: 28017,
        mongoPort: 27017,
        webStatusPort: 28017,
        image: {
            repository: "mongo",
            tag: "3.1",
        }
    };

    build() {
        const props = this.props;

        return (
            <Container
                name={props.name!}
                dockerHost={props.dockerHost}
                image={props.image!}
                ports={[props.mongoCtrPort!, props.webStatusCtrPort!]}
                stdinOpen={true}
                tty={true}
                command="mongod --rest --httpinterface --smallfiles"
                portBindings={{
                    // ctr port : host port
                    [props.mongoCtrPort!]: props.mongoPort!,
                    [props.webStatusCtrPort!]: props.webStatusPort!
                }}
            />
        );
    }
}
