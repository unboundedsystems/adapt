import Adapt, {
    AdaptElement,
    AdaptMountedElement,
    build,
    createStateStore,
    PrimitiveComponent,
    serializeDom,
} from "@usys/adapt";
import { waitFor } from "@usys/utils";
import describeFixture from "mocha-nock";
import should from "should";

import { awsutils, createMockLogger } from "@usys/testutils";
import {
    AwsCredentialsProps,
    awsDefaultCredentialsContext,
    CFStack,
    CFStackStatus,
    EC2Instance,
    EC2InstanceStatus,
    loadAwsCreds,
} from "../../src/aws";
import { createAwsPlugin } from "../../src/aws/aws_plugin";
import { adaptDeployIdTag, getTag } from "../../src/aws/plugin_utils";
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

class Foo extends PrimitiveComponent<{}> {}

// Normally, there are a couple of names that are randomly generated for
// each build/deploy. But to use our static mock HTTP responses, the names
// must be the same on every test run.
const useFixedNames = true;

describe("AWS EC2Instance component tests", () => {
    it("Should instantiate EC2Instance", async () => {
        const orig =
            <EC2Instance
                imageId="ami12345"
                instanceType="t2.micro"
                sshKeyName="mykey"
                securityGroups={["secgroupname"]}
            >
                <Foo />
            </EC2Instance>;
        const { dom } = await doBuild(orig);

        const domXml = serializeDom(dom);
        const expected =
`<Adapt>
  <CFResourcePrimitive>
    <__props__>
      <prop name="Properties">{
  "InstanceType": "t2.micro",
  "KeyName": "mykey",
  "ImageId": "ami12345",
  "SecurityGroups": [
    "secgroupname"
  ]
}</prop>
      <prop name="Type">"AWS::EC2::Instance"</prop>
      <prop name="key">"anonymous"</prop>
    </__props__>
    <Foo key="Foo"/>
  </CFResourcePrimitive>
</Adapt>
`;
        should(domXml).eql(expected);
    });

    it("Should encode userData", async () => {
        const userData =
`#!/bin/bash
apt-get update -qq
`;
        const orig =
            <EC2Instance
                imageId="ami12345"
                instanceType="t2.micro"
                sshKeyName="mykey"
                securityGroups={["secgroupname"]}
                userData={userData}
            />;
        const { dom } = await doBuild(orig);

        const domXml = serializeDom(dom);
        // FIXME: key prop is incorrect
        const expected =
`<Adapt>
  <CFResourcePrimitive>
    <__props__>
      <prop name="Properties">{
  "InstanceType": "t2.micro",
  "KeyName": "mykey",
  "ImageId": "ami12345",
  "SecurityGroups": [
    "secgroupname"
  ],
  "UserData": "IyEvYmluL2Jhc2gKYXB0LWdldCB1cGRhdGUgLXFxCg=="
}</prop>
      <prop name="Type">"AWS::EC2::Instance"</prop>
      <prop name="key">"anonymous"</prop>
    </__props__>
  </CFResourcePrimitive>
</Adapt>
`;
        should(domXml).eql(expected);
    });
});

// WARNING: Do not commit with this set to true (it slows down tests)
const captureForNock = false;

// tslint:disable-next-line: no-console
if (captureForNock) console.warn("\n*****\n\nWARNING: running with captureForNock enabled\n\n*****");

// When we're capturing, poll less frequently so there are fewer requests
// to have to delete in the captured API requests. Otherwise, optimize for
// getting results faster.
const pollMs = captureForNock ? 20 * 1000 : 1000;

describeFixture("AWS EC2Instance API tests", () => {
    let creds: AwsCredentialsProps;
    let client: AWS.CloudFormation;
    const deployID = useFixedNames ? "test-adapt-xqav" : makeDeployId("test-adapt");
    const stackName =
        useFixedNames ? {
            baseId: "ci-testStack-kattrsjz",
            policy: ResourceIdPolicy.globalCreateOrUse
        } :
        "ci-testStack";

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
            dataDir: "/fake/datadir",
        };

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        await act(actions);
        await plugin.finish();
    }

    async function getStatus(orig: AdaptMountedElement) {
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
                        name="testInstance1"
                    />
                </CFStack>
            </Creds.Provider>;
        const stateStore = createStateStore();
        const { mountedOrig, contents: dom } = await build(root, null, {
            deployID,
            stateStore,
        });

        if (mountedOrig == null) throw should(mountedOrig).not.be.Null();
        if (dom == null) throw should(dom).not.be.Null();

        const stackNames = getStackNames(dom);
        should(stackNames).have.length(1);

        let stkStatus: CFStackStatus = await getStatus(mountedOrig);
        if (stkStatus.childStatus == null) throw should(stkStatus.childStatus).not.be.Undefined();
        should(stkStatus.childStatus).be.an.Array();
        should(stkStatus.childStatus).have.length(1);
        let iStatus: EC2InstanceStatus = stkStatus.childStatus[0];
        should(iStatus.noStatus).match(/EC2Instance with ID .* does not exist/);

        await runPlugin(dom);
        const stacks = await waitForStacks(client, deployID, stackNames, {
            pollMs,
            timeoutMs: 4 * 60 * 1000,
        });
        should(stacks).have.length(1);

        await waitFor(12, 10, "EC2Instance did not return a status", async () => {
            stkStatus = await getStatus(mountedOrig);
            if (stkStatus.childStatus == null) throw should(stkStatus.childStatus).not.be.Undefined();
            iStatus = stkStatus.childStatus[0];
            return iStatus.State != null && iStatus.State.Name === "running";
        });

        should(iStatus.KeyName).equal(sshKeyName);
        should(iStatus.InstanceType).equal("t2.micro");
        should(getTag(iStatus, adaptDeployIdTag)).equal(deployID);
        should(getTag(iStatus, "Name")).equal("testInstance1");
    });
});
