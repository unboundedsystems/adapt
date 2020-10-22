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
    AdaptElement,
    AdaptMountedElement,
    build,
    createStateStore,
    Group,
    serializeDom,
} from "@adpt/core";
import should from "should";

import {
    awsutils,
    createMockLogger,
} from "@adpt/testutils";
import describeFixture from "mocha-nock";
import {
    AwsCredentials,
    awsDefaultCredentialsContext,
    CFStack,
    CFStackStatus,
    createAwsPlugin,
    EC2Instance,
    EC2InstanceStatus,
    loadAwsCreds,
} from "../../src/aws";
import { ResourceIdPolicy } from "../../src/resource_id";
import { act, doBuild, makeDeployId } from "../testlib";
import { getStackNames } from "./aws_testlib";

const {
    defaultSecurityGroup,
    deleteAllStacks,
    getAwsClient,
    sshKeyName,
    ubuntuAmi,
    waitForStacks,
} = awsutils;

// Normally, there are a couple of names that are randomly generated for
// each build/deploy. But to use our static mock HTTP responses, the names
// must be the same on every test run.
const useFixedNames = true;

describe("AWS CFStack component tests", () => {
    it("Should instantiate CFStack with local name", async () => {
        const orig =
            <CFStack
                StackName="mystack"
            />;
        const { dom } = await doBuild(orig);

        let domXml = serializeDom(dom);
        // Replace random portion of the stack name
        domXml = domXml.replace(/mystack-[a-z]{8}/, "mystack-XXXXXXXX");
        const expected =
`<Adapt>
  <CFStackPrimitive>
    <__props__>
      <prop name="StackName">"mystack-XXXXXXXX"</prop>
      <prop name="awsCredentials">{
        awsAccessKeyId: "",
        awsSecretAccessKey: "",
        awsRegion: "",
      }</prop>
      <prop name="key">"anonymous"</prop>
    </__props__>
  </CFStackPrimitive>
</Adapt>
`;
        should(domXml).equal(expected);
    });

    it("Should instantiate CFStack with global name", async () => {
        const name = { baseId: "mystack", policy: ResourceIdPolicy.globalCreateOnly };
        const orig =
            <CFStack
                StackName={name}
            />;
        const { dom } = await doBuild(orig);

        const domXml = serializeDom(dom);
        const expected =
`<Adapt>
  <CFStackPrimitive StackName="mystack">
    <__props__>
      <prop name="awsCredentials">{
        awsAccessKeyId: "",
        awsSecretAccessKey: "",
        awsRegion: "",
      }</prop>
      <prop name="key">"anonymous"</prop>
    </__props__>
  </CFStackPrimitive>
</Adapt>
`;
        should(domXml).equal(expected);
    });

    it("Should not allow nested stacks", async () => {
        const orig =
            <CFStack StackName="outer">
                <Group>
                    <CFStack StackName="inner" />
                </Group>
            </CFStack>;
        const out = await build(orig, null);
        should(out.messages).have.length(1);
        should(out.messages[0].content).match(/Nested CFStacks are not currently supported/);
    });

    it("Should not allow two stacks with same domain and StackName");
});

// WARNING: Do not commit with this set to true (it slows down tests)
const captureForNock = false;

// tslint:disable-next-line: no-console
if (captureForNock) console.warn("\n*****\n\nWARNING: running with captureForNock enabled\n\n*****");

// When we're capturing, poll less frequently so there are fewer requests
// to have to delete in the captured API requests. Otherwise, optimize for
// getting results faster.
const pollMs = captureForNock ? 20 * 1000 : 1000;

describeFixture("AWS CFStack API tests", () => {
    let creds: AwsCredentials;
    let client: AWS.CloudFormation;
    const deployID = useFixedNames ? "test-adapt-vzij" : makeDeployId("test-adapt");

    before(async function () {
        this.timeout(10 * 1000);
        creds = await loadAwsCreds();
        client = getAwsClient(creds);
        await deleteAllStacks(client, deployID, {
            pollMs: 10 * 1000,
            definite: false,
        });
    });

    afterEach(async function () {
        this.timeout(65 * 1000 + pollMs);
        if (client) {
            await deleteAllStacks(client, deployID, {
                pollMs,
                timeoutMs: 60 * 1000 + pollMs,
                definite: false,
            });
        }
    });

    async function runPlugin(dom: AdaptElement) {
        const plugin  = createAwsPlugin();
        const logger = createMockLogger();
        const options = {
            deployID,
            log: logger.info,
            logger,
            dataDir: "/fake/datadir",
        };

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        await act(actions);
        await plugin.finish();
    }

    async function getStackStatus(orig: AdaptMountedElement): Promise<CFStackStatus> {
        const status = await orig.status<CFStackStatus>();
        should(status).be.type("object");
        return status;
    }

    /*
     * NOTES ON USING NOCK
     * To rebuild the mocha-nock mocked HTTP responses:
     * 1. Delete the file that corresponds to this test case in
     *    cloud/test/fixtures.
     * 2. Set captureForNock to true (see above). This will reduce the number
     *    of API requests recorded and make it easier to edit the capture.
     * 3. Optionally, set useFixedNames to false in order to generate new
     *    random stack name and deployID.
     * 4. Run this test. That will create the test/fixtures file again.
     * 5. In order to reduce test run time, edit the fixture file and manually
     *    delete the all the responses that have StackStatus=CREATE_IN_PROGRESS.
     * 6. Set captureForNock to false again.
     * 7. If you set useFixedNames=false, set it to true again and update the
     *    associated strings to the values found in the test fixture.
     */
    it("Should build and have status", async function () {
        this.timeout(5 * 60 * 1000); // For when not using mock HTTP data
        this.slow(3 * 1000); // With mock data, this usually runs in about 2s
        const stackName =
            useFixedNames ? {
                baseId: "ci-testStack-kknursjz",
                policy: ResourceIdPolicy.globalCreateOrUse
            } :
            "ci-testStack";
        // tslint:disable-next-line:variable-name
        const Creds = awsDefaultCredentialsContext;
        const root =
            <Creds.Provider value={creds}>
                <CFStack
                    StackName={stackName}
                    OnFailure="DO_NOTHING"
                >
                    <EC2Instance
                        key="i1"
                        imageId={ubuntuAmi}
                        instanceType="t2.micro"
                        sshKeyName={sshKeyName}
                        securityGroups={[defaultSecurityGroup]}
                        name="testInstance3"
                    />
                </CFStack>
            </Creds.Provider>;
        const stateStore = createStateStore();
        const { mountedOrig, contents: dom } = await build(root, null, { deployID, stateStore });

        if (mountedOrig == null) throw should(mountedOrig).not.be.Null();
        if (dom == null) throw should(dom).not.be.Null();

        const stackNames = getStackNames(dom);
        should(stackNames).have.length(1);

        let stkStatus = await getStackStatus(mountedOrig);
        should(stkStatus.noStatus).equal(`Stack with id ${stackNames[0]} does not exist`);
        if (stkStatus.childStatus == null) throw should(stkStatus.childStatus).should.not.be.Undefined();
        should(stkStatus.childStatus).be.an.Array();
        should(stkStatus.childStatus).have.length(1);
        const iStatus: EC2InstanceStatus = stkStatus.childStatus[0];
        should(iStatus.noStatus).match(/EC2Instance with ID .* does not exist/);

        await runPlugin(dom);
        const stacks = await waitForStacks(client, deployID, stackNames, {
            pollMs,
            timeoutMs: 4 * 60 * 1000,
        });
        should(stacks).have.length(1);

        stkStatus = await getStackStatus(mountedOrig);
        should(stkStatus.StackName).equal(stackNames[0]);
        should(stkStatus.StackStatus).equal("CREATE_COMPLETE");
        should(stkStatus.Tags[0].Key).equal("adapt:deployID");
    });
});
