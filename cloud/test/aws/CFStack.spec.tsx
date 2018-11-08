import Adapt, { build, Group, serializeDom } from "@usys/adapt";
import * as should from "should";

import { CFStack } from "../../src/aws";
import { ResourceIdPolicy } from "../../src/resource_id";
import { doBuild } from "../testlib";

describe("AWS CFStack component tests", () => {
    it("Should instantiate CFStack with local name", async () => {
        const orig =
            <CFStack
                StackName="mystack"
            />;
        const dom = await doBuild(orig);

        let domXml = serializeDom(dom);
        // Replace random portion of the stack name
        domXml = domXml.replace(/mystack-[a-z]{8}/, "mystack-XXXXXXXX");
        const expected =
`<Adapt>
  <CFStackPrimitive>
    <__props__>
      <prop name="StackName">"mystack-XXXXXXXX"</prop>
      <prop name="awsCredentials">{
  "awsAccessKeyId": "",
  "awsSecretAccessKey": "",
  "awsRegion": ""
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
        const dom = await doBuild(orig);

        const domXml = serializeDom(dom);
        const expected =
`<Adapt>
  <CFStackPrimitive StackName="mystack">
    <__props__>
      <prop name="awsCredentials">{
  "awsAccessKeyId": "",
  "awsSecretAccessKey": "",
  "awsRegion": ""
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
