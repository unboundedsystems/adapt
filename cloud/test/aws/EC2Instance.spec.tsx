import Adapt, { PluginOptions, serializeDom } from "@usys/adapt";
import * as should from "should";

import { awsutils, createMockLogger, MockLogger } from "@usys/testutils";
import { AwsCredentialsProps, awsDefaultCredentialsContext, CFStack, EC2Instance } from "../../src/aws";
import { AwsPluginImpl, createAwsPlugin } from "../../src/aws/aws_plugin";
import { doBuild } from "../testlib";

const { fakeCreds } = awsutils;

describe("AWS EC2Instance component tests", () => {
    it("Should instantiate EC2Instance", async () => {
        const orig =
            <EC2Instance
                imageId="ami12345"
                instanceType="t2.micro"
                sshKeyName="mykey"
                securityGroups={["secgroupname"]}
            />;
        const dom = await doBuild(orig);

        const domXml = serializeDom(dom);
        const expected =
`<Adapt>
  <CFResource>
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
      <prop name="key">"anonymous-CFResource"</prop>
    </__props__>
  </CFResource>
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
        const dom = await doBuild(orig);

        const domXml = serializeDom(dom);
        // FIXME: key prop is incorrect
        const expected =
`<Adapt>
  <CFResource>
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
      <prop name="key">"anonymous-CFResource"</prop>
    </__props__>
  </CFResource>
</Adapt>
`;
        should(domXml).eql(expected);
    });
});

describe("AWS EC2Instance to real API tests", () => {
    // tslint:disable-next-line:variable-name
    const Creds = awsDefaultCredentialsContext;
    let creds: AwsCredentialsProps;
    let plugin: AwsPluginImpl;
    let options: PluginOptions;
    let logger: MockLogger;

    before(async () => {
        creds = await fakeCreds();
    });
    beforeEach(() => {
        plugin  = createAwsPlugin();
        logger = createMockLogger();
        options = {
            dataDir: "/fake/datadir",
            deployID: "abc123",
            log: logger.info,
        };
    });

    xit("Should create EC2Instance", async () => {
        const orig =
            <Creds.Provider value={creds}>
                <CFStack StackName="mystack">
                    <EC2Instance
                        imageId="ami12345"
                        instanceType="t2.micro"
                        sshKeyName="mykey"
                        securityGroups={["secgroupname"]}
                    />
                </CFStack>
            </Creds.Provider>;
        const dom = await doBuild(orig);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Creating\s.+CFStack/);

        await plugin.finish();

    });
});
