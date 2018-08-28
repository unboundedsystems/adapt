import Adapt, { Group, PluginOptions } from "@usys/adapt";
import * as should from "should";

import { createMockLogger, MockLogger } from "@usys/testutils";
import { AwsCredentialsProps, awsDefaultCredentialsContext, CFStack, EC2Instance } from "../../src/aws";
import {
    AwsPluginImpl,
    createAwsPlugin,
    createTemplate,
    findStackElems,
} from "../../src/aws/aws_plugin";
import {
    act,
    checkStackStatus,
    defaultSecurityGroup,
    deleteAllStacks,
    doBuild,
    loadCreds,
    sshKeyName,
    ubuntuAmi,
    waitForStacks,
} from "./helpers";

// tslint:disable-next-line:no-var-requires
const awsMock = require("aws-sdk-mock");
import * as AWS from "aws-sdk";

function getClient(creds: AwsCredentialsProps) {
    return new AWS.CloudFormation({
        region: creds.awsRegion,
        accessKeyId: creds.awsAccessKeyId,
        secretAccessKey: creds.awsSecretAccessKey,
    });
}

// tslint:disable:max-line-length
const describeStackResp = {
    ResponseMetadata: {
        RequestId: "b4d90490-ac37-11e8-8ac9-650e6aed7324"
    },
    Stacks: [
        {
            StackId: "arn:aws:cloudformation:us-west-2:941954696364:stack/AwsServerlessExpressStack/b802cdc0-b2ac-11e7-8c2e-500c32c86c8d",
            StackName: "AwsServerlessExpressStack",
            ChangeSetId: "arn:aws:cloudformation:us-west-2:941954696364:changeSet/awscli-cloudformation-package-deploy-1508184053/ef739643-84e3-428d-ada9-f27e5cd15b8b",
            Description: "Serverless Express Application/API powered by API Gateway and Lambda",
            Parameters: [],
            CreationTime: "2017-10-16T20:00:55.048Z",
            LastUpdatedTime: "2017-10-16T20:01:00.916Z",
            RollbackConfiguration: {},
            StackStatus: "CREATE_COMPLETE",
            DisableRollback: false,
            NotificationARNs: [],
            Capabilities: [
                "CAPABILITY_IAM"
            ],
            Outputs: [
                {
                    OutputKey: "ApiUrl",
                    OutputValue: "https://3dq32rsn68.execute-api.us-west-2.amazonaws.com/prod/",
                    Description: "Invoke URL for your API. Clicking this link will perform a GET request on the root resource of your API."
                },
            ],
            Tags: []
        },
        {
            StackId: "arn:aws:cloudformation:us-west-2:941954696364:stack/foodapp-dev/618ffeb0-d439-11e6-93a9-50a68a201256",
            StackName: "foodapp-dev",
            Parameters: [],
            CreationTime: "2017-01-06T17:55:59.807Z",
            LastUpdatedTime: "2017-01-09T20:19:11.031Z",
            RollbackConfiguration: {},
            StackStatus: "UPDATE_COMPLETE",
            DisableRollback: false,
            NotificationARNs: [],
            Capabilities: [],
            Outputs: [],
            Tags: []
        },
    ]
};
// tslint:enable:max-line-length

// tslint:disable-next-line:variable-name
const Creds = awsDefaultCredentialsContext;
function simpleDom(creds: AwsCredentialsProps) {
    return (
        <Creds.Provider value={creds}>
            <Group>
                <CFStack StackName="testStack1" OnFailure="DO_NOTHING">
                    <EC2Instance
                        imageId={ubuntuAmi}
                        instanceType="t2.micro"
                        sshKeyName={sshKeyName}
                        securityGroups={[defaultSecurityGroup]}
                    />
                    <EC2Instance
                        imageId={ubuntuAmi}
                        instanceType="t2.micro"
                        sshKeyName={sshKeyName}
                        securityGroups={[defaultSecurityGroup]}
                    />
                </CFStack>

                <CFStack StackName="testStack2" OnFailure="DO_NOTHING">
                    <EC2Instance
                        imageId={ubuntuAmi}
                        instanceType="t2.micro"
                        sshKeyName={sshKeyName}
                        securityGroups={[defaultSecurityGroup]}
                    />
                </CFStack>
            </Group>
        </Creds.Provider>
    );
}

describe("AWS plugin basic tests", () => {
    let creds: AwsCredentialsProps;
    let plugin: AwsPluginImpl;
    let options: PluginOptions;
    let logger: MockLogger;

    before(async () => {
        awsMock.setSDKInstance(AWS);
        creds = await loadCreds();
    });
    beforeEach(() => {
        plugin  = createAwsPlugin();
        logger = createMockLogger();
        options = {
            deployID: "abc123",
            log: logger.info,
        };
    });
    after(() => {
        awsMock.restore();
    });

    it("Should compute create actions", async () => {
        awsMock.mock("CloudFormation", "describeStacks", describeStackResp);
        const orig = simpleDom(creds);
        const dom = await doBuild(orig);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(2);
        should(actions[0].description).match(/Creating\s.+CFStack/);
        should(actions[1].description).match(/Creating\s.+CFStack/);

        await plugin.finish();
    });

    it("Should create template", async () => {
        const orig = simpleDom(creds);
        const dom = await doBuild(orig);
        const stackEls = findStackElems(dom);
        should(stackEls).have.length(2);
        const templ = createTemplate(stackEls[0]);
        should(Object.keys(templ.Resources)).have.length(2);
    });
});

describe("AWS plugin live tests", function () {
    let creds: AwsCredentialsProps;
    let plugin: AwsPluginImpl;
    let options: PluginOptions;
    let logger: MockLogger;
    let client: AWS.CloudFormation;
    const deployID = "abc123";

    this.timeout(5 * 60 * 1000);

    before(async () => {
        creds = await loadCreds();
        client = getClient(creds);
        await deleteAllStacks(client, deployID);
    });
    beforeEach(() => {
        plugin  = createAwsPlugin();
        logger = createMockLogger();
        options = {
            deployID,
            log: logger.info,
        };
    });
    afterEach(async function () {
        this.timeout(65 * 1000);
        await deleteAllStacks(client, deployID, 60 * 1000);
    });

    it("Should create stacks", async () => {
        const orig = simpleDom(creds);
        const dom = await doBuild(orig);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(2, "wrong number of actions");
        should(actions[0].description).match(/Creating\s.+CFStack/);
        should(actions[1].description).match(/Creating\s.+CFStack/);

        await act(actions);
        await plugin.finish();

        const stacks = await waitForStacks(client, deployID,
                                           ["testStack1", "testStack2"],
                                           {timeoutMs: 4 * 60 * 1000});
        should(stacks).have.length(2, "wrong number of stacks");
        console.log(JSON.stringify(stacks, null, 2));
        await checkStackStatus(stacks[0], "CREATE_COMPLETE", true, client);
        await checkStackStatus(stacks[1], "CREATE_COMPLETE", true, client);
    });
});
