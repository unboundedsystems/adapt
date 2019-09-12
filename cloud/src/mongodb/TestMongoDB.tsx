/*
 * Copyright 2019 Unbounded Systems, LLC
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
    callInstanceMethod,
    handle,
    SFCBuildProps,
    SFCDeclProps,
    useImperativeMethods
} from "@adpt/core";
import { ConnectToInstance } from "../ConnectTo";
import { Container, } from "../Container";
import { NetworkService, } from "../NetworkService";
import { Service, } from "../Service";

const testMongoDefaultProps = {
    image: "mongo:latest",
    imagePullPolicy: "Always",
    port: 27017
};

/**
 * Props for {@link mongodb.TestMongoDB}
 *
 * @public
 */
export interface TestMongoDBProps {
    /** Image used for TestMongoDB container, defaults to mongo:latest */
    image: string;
    /** Specifies when to pull image, defaults to `"Always"` */
    imagePullPolicy: "Always" | "IfNotPresent" | "Never" | undefined;
    /** Port on which the Mongo DB service is exposed */
    port: number;
}

/**
 * Test {@link https://www.mongodb.com | MongoDB} Service
 *
 * @remarks
 *
 * Uses an abstract {@link Service}, {@link NetworkService}, and {@link Container}
 * component that must be substituted in a style sheet.
 *
 * See {@link mongodb.TestMongoDBProps}.
 *
 * @public
 */
export function TestMongoDB(props: SFCDeclProps<TestMongoDBProps>) {
    const lprops = props as SFCBuildProps<TestMongoDBProps, typeof testMongoDefaultProps>;
    const svc = handle();
    const mongo = handle();

    useImperativeMethods<ConnectToInstance>(() => ({
        connectEnv: () => {
            const hostname = callInstanceMethod(svc, undefined, "hostname");
            const port = callInstanceMethod(svc, undefined, "port");
            if (!hostname || !port) return undefined;
            return {
                MONGODB_URI: `mongodb://${hostname}:${port}`
            };
        },
        image: () => lprops.image
    }));
    return <Service>
        <NetworkService
            handle={svc}
            endpoint={mongo}
            port={lprops.port}
            targetPort={27017}
        />
        <Container
            handle={mongo}
            name="mongodb"
            image={lprops.image}
            ports={[27017]}
            imagePullPolicy={lprops.imagePullPolicy}
        />
    </Service>;
}
TestMongoDB.defaultProps = testMongoDefaultProps;
