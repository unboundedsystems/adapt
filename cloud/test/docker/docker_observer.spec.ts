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

import { ExecutedQuery, gql, ObserverResponse } from "@adpt/core";
import { execute } from "graphql";
import should from "should";
import { DockerObserver } from "../../src/docker/docker_observer";

function checkObservations(observations: ObserverResponse) {
    should(observations).not.Undefined();
    should(observations).not.Null();

    const context = observations.context;
    should(context).not.Undefined();
    should(Object.keys(context)).length(1);
    const containers = context[Object.keys(context)[0]];
    should(containers).not.Undefined();
    should(containers.length).greaterThan(0); // The current container should at least be running
    const ctr = containers[0];
    should(ctr.Id).be.a.String();
    should(ctr.State).be.a.String();
    should(ctr.Names).be.an.Array();
}

describe("Docker observer tests", () => {
    let observer: DockerObserver;
    let queries: ExecutedQuery[];

    before("Construct schema", function () {
        this.timeout(40 * 1000);
        this.slow(17 * 1000);
        observer = new DockerObserver();
        observer.schema; //Force slow construction of schema once for whole suite
    });

    before(() => {
        queries = [
            {
                query: gql`query ($dockerHost: String!) {
                    withDockerHost(dockerHost: $dockerHost) {
                        ContainerList {
                            Id
                            State
                            Names
                        }
                    }
                }`,
                variables: { dockerHost: "file:///var/run/docker.sock"}
            },
        ];
    });

    beforeEach("Instantiate observer", function () {
        this.slow(500);
        this.timeout(2 * 1000);
        observer = new DockerObserver();
    });

    it("should observe running containers", async function () {
        this.slow(500);
        this.timeout(5000);

        const observations = await observer.observe(queries);
        checkObservations(observations);
    });

    it("should query running containers", async function () {
        this.slow(500);
        this.timeout(5000);

        const schema = observer.schema;
        let result = await execute(
            schema,
            queries[0].query,
            undefined,
            undefined,
            queries[0].variables);
        if (result.errors === undefined) return should(result.errors).not.Undefined();
        should(result.errors).length(1);
        should(result.errors[0]!.message).match(/Adapt Observer Needs Data/);

        const observations = await observer.observe(queries);
        checkObservations(observations); //Tested above but makes debugging easier

        result = await execute(
            schema,
            queries[0].query,
            observations.data,
            observations.context,
            queries[0].variables);
        should(result.errors).Undefined();

        const data = result.data;
        if (data == null) throw should(data).be.ok();
        if (data.withDockerHost === undefined) throw should(data.withDockerHost).not.be.Undefined();

        const containers = data.withDockerHost.ContainerList;
        if (containers === undefined) throw should(containers).not.Undefined();
        should(containers.length).be.greaterThan(0);

        const ctr = containers[0];
        should(ctr.Id).be.a.String();
        should(ctr.State).be.a.String();
        should(ctr.Names).be.an.Array();
    });
});
