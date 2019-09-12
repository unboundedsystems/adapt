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
    Group,
    handle,
    Handle,
    useImperativeMethods
} from "@adpt/core";
import should from "should";
import { ConnectToInstance, Environment, NetworkScope, renameEnvVars, useConnectTo } from "../src";
import { doBuild } from "./testlib";

function Connectable(props: { varname: string, value: string }) {
    useImperativeMethods<ConnectToInstance>(() => ({
        connectEnv: (scope: NetworkScope) => [
            { name: props.varname, value: props.value },
            ...(scope ? [{ name: props.varname + "_SCOPE", value: scope }] : [])
        ]
    }));
    return null;
}

interface EnvRef {
    env?: Environment;
}

function ConnectConsumer(props: {
    envRef: EnvRef,
    connectTo: Handle | Handle[],
    mapper?: (env: Environment) => Environment,
    scope?: NetworkScope
}) {
    props.envRef.env = (props.scope !== undefined)
        ? useConnectTo(props.connectTo, { xform: props.mapper, scope: props.scope })
        : useConnectTo(props.connectTo, props.mapper); //Use explicit argument form to test overload
    return null;
}

describe("useConnectTo Tests", () => {
    it("should resolve environment variables", async () => {
        const foo = handle();
        const env: EnvRef = {};
        const orig = <Group>
            <Connectable handle={foo} varname="FOO" value="fooVal" />
            <ConnectConsumer envRef={env} connectTo={foo} />
        </Group>;
        await doBuild(orig);

        should(env.env).eql([{ name: "FOO", value: "fooVal" }]);
    });

    it("should resolve environment variables from multiple components", async () => {
        const foo = handle();
        const bar = handle();
        const env: EnvRef = {};
        const orig = <Group>
            <Connectable handle={foo} varname="FOO" value="fooVal" />
            <Connectable handle={bar} varname="BAR" value="barVal" />
            <ConnectConsumer envRef={env} connectTo={[foo, bar]} />
        </Group>;
        await doBuild(orig);

        should(env.env).eql([
            { name: "FOO", value: "fooVal" },
            { name: "BAR", value: "barVal" }]);
    });

    it("should resolve environment variables with rename", async () => {
        const foo = handle();
        const bar = handle();
        const env: EnvRef = {};
        const orig = <Group>
            <Connectable handle={foo} varname="FOO" value="fooVal" />
            <Connectable handle={bar} varname="BAR" value="barVal" />
            <ConnectConsumer
                envRef={env}
                connectTo={[foo, bar]}
                mapper={(e) => renameEnvVars(e, { BAR: "NEW_BAR" })} />
        </Group>;
        await doBuild(orig);

        should(env.env).eql([
            { name: "FOO", value: "fooVal" },
            { name: "NEW_BAR", value: "barVal" }]);
    });

    it("should forward scope argument to instances", async () => {
        const foo = handle();
        const env: EnvRef = {};
        const orig = <Group>
            <Connectable handle={foo} varname="FOO" value="fooVal" />
            <ConnectConsumer
                envRef={env}
                connectTo={[foo]}
                scope={NetworkScope.external}
            />
        </Group>;
        await doBuild(orig);

        should(env.env).eql([
            { name: "FOO", value: "fooVal" },
            { name: "FOO_SCOPE", value: NetworkScope.external }
        ]);
    });
});
