import Adapt, { serializeDom } from "@usys/adapt";
import * as should from "should";

import { CFStack } from "../../src/aws";
import { doBuild } from "./helpers";

describe("AWS CFStack component tests", () => {
    it("Should instantiate CFStack", async () => {
        const orig =
            <CFStack
                StackName="mystack"
            />;
        const dom = await doBuild(orig);

        const domXml = serializeDom(dom);
        const expected =
`<Adapt>
  <CFStackBase StackName="mystack">
    <__props__>
      <prop name="awsCredentials">{
  "awsAccessKeyId": "",
  "awsSecretAccessKey": "",
  "awsRegion": ""
}</prop>
      <prop name="key">"anonymous"</prop>
    </__props__>
  </CFStackBase>
</Adapt>
`;
        should(domXml).eql(expected);
    });

    it("Should not allow nested stacks");
    it("Should not allow two stacks with same domain and StackName");
});
