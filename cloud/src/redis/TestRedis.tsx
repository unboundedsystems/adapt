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
import { NetworkScope, NetworkService } from "../NetworkService";
import { Service, } from "../Service";

const testRedisDefaultProps = {
    image: "redis:buster",
    imagePullPolicy: "Always",
    port: 6379
};

/**
 * Props for {@link redis.TestRedis}.
 *
 * @public
 */
export interface TestRedisProps {
    /** Image to use for container, defaults to redis:buster */
    image: string;
    /** Specifies when to pull image, defaults to `"Always"` */
    imagePullPolicy: "Always" | "IfNotPresent" | "Never" | undefined;
    /** Port on which the Redis service is exposed */
    port: number;
}

/**
 * Deploys a {@link https://redis.io | Redis} container suitable for testing
 *
 * @remarks
 *
 * Uses an abstract {@link Service}, {@link NetworkService}, and {@link Container}
 * component that must be substituted in a style sheet.
 *
 * * See {@link redis.TestRedisProps}.
 *
 * @public
 */
export function TestRedis(props: SFCDeclProps<TestRedisProps, typeof testRedisDefaultProps>) {
    const lprops = props as SFCBuildProps<TestRedisProps, typeof testRedisDefaultProps>;
    const svc = handle();
    const redis = handle();

    useImperativeMethods<ConnectToInstance>(() => ({
        connectEnv: (scope?: NetworkScope) => {
            const hostname = callInstanceMethod(svc, undefined, "hostname", scope);
            const port = callInstanceMethod(svc, undefined, "port");
            if (!hostname || !port) return undefined;
            return {
                REDIS_URI: `redis://${hostname}:${port}`
            };
        },
        image: () => lprops.image
    }));
    return <Service>
        <NetworkService
            handle={svc}
            endpoint={redis}
            port={lprops.port}
            targetPort={6379}
        />
        <Container
            handle={redis}
            name="redis"
            image={lprops.image}
            ports={[6379]}
            imagePullPolicy={lprops.imagePullPolicy}
        />
    </Service>;
}
TestRedis.defaultProps = testRedisDefaultProps;
