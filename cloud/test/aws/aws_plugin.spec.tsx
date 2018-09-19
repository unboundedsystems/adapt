import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    createStateStore,
    findElementsInDom,
    Group,
    isElement,
    isPrimitiveElement,
    PluginOptions,
    PrimitiveComponent,
    Style,
} from "@usys/adapt";
import { compact } from "lodash";
import * as randomstring from "randomstring";
import * as should from "should";

import { createMockLogger, describeLong, loadAwsCreds, MockLogger } from "@usys/testutils";
import {
    AwsCredentialsProps,
    awsDefaultCredentialsContext,
    CFStack,
    EC2Instance
} from "../../src/aws";
import {
    AwsPluginImpl,
    createAwsPlugin,
    createTemplate,
    findStackElems,
    getTag,
} from "../../src/aws/aws_plugin";
import {
    act,
    checkStackStatus,
    defaultSecurityGroup,
    deleteAllStacks,
    doBuild,
    fakeCreds,
    getStackNames,
    isProbablyDeleted,
    sshKeyName,
    ubuntuAmi,
    waitForStacks,
} from "./helpers";

// tslint:disable-next-line:no-var-requires
const awsMock = require("aws-sdk-mock");
import * as AWS from "aws-sdk";

class Extra extends PrimitiveComponent {
}
function isExtraElement(val: unknown) {
    return isElement(val) && isPrimitiveElement(val) && val.componentType === Extra;
}
function findExtras(dom: AdaptElementOrNull): AdaptElement[] {
    const rules = <Style>{Extra} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isExtraElement(e) ? e : null));
}

function getClient(creds: AwsCredentialsProps) {
    return new AWS.CloudFormation({
        region: creds.awsRegion,
        accessKeyId: creds.awsAccessKeyId,
        secretAccessKey: creds.awsSecretAccessKey,
    });
}

function makeDeployId(prefix: string) {
    const rand = randomstring.generate({
        length: 4,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `${prefix}-${rand}`;
}
interface InstanceIds {
    physical: string;
    logical: string;
}

async function getInstanceIds(
    client: AWS.CloudFormation,
    dom: AdaptElementOrNull,
    stackName: string,
    instName: string,
): Promise<InstanceIds> {

    const logical = instanceLogicalId(dom, stackName, instName);

    const resp = await client.describeStackResource({
        StackName: stackName,
        LogicalResourceId: logical,
    }).promise();
    if (!resp.StackResourceDetail) throw should(resp.StackResourceDetail).not.be.Null();

    const physical = resp.StackResourceDetail.PhysicalResourceId;
    if (!physical) throw should(physical).not.be.Null();

    return { logical, physical };
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

export interface SimpleDomConfig {
    creds: AwsCredentialsProps;
    secondStack?: boolean;
    testTagVal?: string;
    secondInstance?: boolean;
    addExtra?: boolean;
}

// tslint:disable-next-line:variable-name
const Creds = awsDefaultCredentialsContext;
function simpleDom(config: SimpleDomConfig) {
    const defaults = {
        secondStack: true,
        testTagVal: "value1",
        secondInstance: true,
        addExtra: false,
    };
    const { creds, secondStack, testTagVal, secondInstance, addExtra } = { ...defaults, ...config };
    const tags = [ { Key: "testTag", Value: testTagVal } ];

    return (
        <Creds.Provider value={creds}>
            <Group>
                <CFStack
                    StackName="ci-testStack1"
                    OnFailure="DO_NOTHING"
                    Tags={tags}
                >
                    { secondInstance ?
                        <EC2Instance
                            key="i1"
                            imageId={ubuntuAmi}
                            instanceType="t2.micro"
                            sshKeyName={sshKeyName}
                            securityGroups={[defaultSecurityGroup]}
                            name="testInstance1"
                        />
                        :
                        null
                    }
                    <EC2Instance
                        key="i2"
                        imageId={ubuntuAmi}
                        instanceType="t2.micro"
                        sshKeyName={sshKeyName}
                        securityGroups={[defaultSecurityGroup]}
                        name="testInstance2"
                    />
                    { addExtra ? <Extra key="imextra" /> : null }
                </CFStack>

                { secondStack ?
                    <CFStack
                        StackName="ci-testStack2"
                        OnFailure="DO_NOTHING"
                        Tags={tags}
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
                    :
                    null
                }
            </Group>
        </Creds.Provider>
    );
}

function instanceLogicalId(
    dom: AdaptElementOrNull,
    stackName: string,
    instName: string
): string {
    const stacks = findStackElems(dom).filter((s) => s.props.StackName === stackName);
    if (stacks.length !== 1) throw new Error(`Should be exactly 1 stack match`);
    const template = createTemplate(stacks[0]);
    for (const logId of Object.keys(template.Resources)) {
        const res = template.Resources[logId];
        if (res.Type !== "AWS::EC2::Instance") continue;
        if (getTag(res.Properties, "Name") === instName) return logId;
    }
    throw new Error(`Can't find instance ${stackName} : ${instName}`);
}

describe("AWS plugin basic tests", () => {
    let creds: AwsCredentialsProps;
    let plugin: AwsPluginImpl;
    let options: PluginOptions;
    let logger: MockLogger;

    before(async () => {
        awsMock.setSDKInstance(AWS);
        creds = await fakeCreds();
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

    it("Should allow additional DOM elements under CFStack", async () => {
        awsMock.mock("CloudFormation", "describeStacks", describeStackResp);
        const orig = simpleDom({ creds, addExtra: true });
        const dom = await doBuild(orig);

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(2);
        should(actions[0].description).match(/Creating\s.+CFStack/);
        should(actions[1].description).match(/Creating\s.+CFStack/);

        await plugin.finish();

        const extras = findExtras(dom);
        should(extras).have.length(1);
        should(extras[0].props.key).equal("imextra");
    });

    it("Should compute create actions", async () => {
        awsMock.mock("CloudFormation", "describeStacks", describeStackResp);
        const orig = simpleDom({ creds });
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
        const orig = simpleDom({ creds });
        const dom = await doBuild(orig);
        const stackEls = findStackElems(dom);
        should(stackEls).have.length(2);
        const templ = createTemplate(stackEls[0]);
        should(Object.keys(templ.Resources)).have.length(2);
    });
});

// NOTE(mark): These tests purposely build on one another to reduce total
// runtime, since the real AWS API is pretty slow.
describeLong("AWS plugin live tests", function () {
    const stateStore = createStateStore();
    let domConfig: SimpleDomConfig;
    let creds: AwsCredentialsProps;
    let plugin: AwsPluginImpl;
    let options: PluginOptions;
    let logger: MockLogger;
    let client: AWS.CloudFormation;
    let stepComplete = 0;
    let prevDom: AdaptElementOrNull = null;
    let toDestroyStack: string | undefined;
    const instIds: InstanceIds[] = [];
    let stackNames: string[];
    const deployID = makeDeployId("test-adapt");

    this.timeout(5 * 60 * 1000);

    before(async () => {
        creds = await loadAwsCreds();
        domConfig = { creds };
        client = getClient(creds);
        await deleteAllStacks(client, deployID, 10 * 1000, false);
    });
    beforeEach(() => {
        plugin  = createAwsPlugin();
        logger = createMockLogger();
        options = {
            deployID,
            log: logger.info,
        };
    });
    after(async function () {
        this.timeout(65 * 1000);
        if (client) await deleteAllStacks(client, deployID, 60 * 1000, false);
    });

    it("Should create stacks [step 1]", async () => {
        const orig = simpleDom(domConfig);
        const dom = await doBuild(orig, stateStore);
        stackNames = getStackNames(dom);

        should(stackNames).have.length(2);
        should(stackNames[0]).match(/^ci-testStack1[a-z]{8}$/);
        should(stackNames[1]).match(/^ci-testStack2[a-z]{8}$/);

        await plugin.start(options);
        const obs = await plugin.observe(prevDom, dom);
        const actions = plugin.analyze(prevDom, dom, obs);
        should(actions.length).equal(2, "wrong number of actions");
        should(actions[0].description).match(/Creating\s.+CFStack/);
        should(actions[1].description).match(/Creating\s.+CFStack/);

        await act(actions);
        await plugin.finish();

        const stacks = await waitForStacks(client, deployID, stackNames,
                                           {timeoutMs: 4 * 60 * 1000});
        should(stacks).have.length(2, "wrong number of stacks");
        await checkStackStatus(stacks[0], "CREATE_COMPLETE", true, client);
        await checkStackStatus(stacks[1], "CREATE_COMPLETE", true, client);

        for (const s of stacks) {
            should(getTag(s, "testTag")).equal("value1");
            if (s.StackName === stackNames[1]) {
                toDestroyStack = s.StackId;
                break;
            }
        }
        should(toDestroyStack).be.type("string");

        // Remember some stuff about our instances
        instIds.push(
            await getInstanceIds(client, dom, stackNames[0], "testInstance1"),
            await getInstanceIds(client, dom, stackNames[0], "testInstance2"),
        );
        should(instIds).have.length(2);

        prevDom = dom;
        stepComplete++;
    });

    it("Should not update stack with no changes [step 2]", async () => {
        should(stepComplete).equal(1, "Previous test did not complete");

        await plugin.start(options);
        const obs = await plugin.observe(prevDom, prevDom);
        const actions = plugin.analyze(prevDom, prevDom, obs);
        should(actions.length).equal(0, "wrong number of actions");

        await act(actions);
        await plugin.finish();

        stepComplete++;
    });

    it("Should destroy stack [step 3]", async () => {
        should(stepComplete).equal(2, "Previous test did not complete");
        if (!toDestroyStack) throw new Error(`Previous test did not complete`);

        // Remove one of the stacks from the dom
        domConfig.secondStack = false;
        const orig = simpleDom(domConfig);
        const dom = await doBuild(orig, stateStore);
        const newStackNames = getStackNames(dom);

        // Stack name shouldn't change
        should(newStackNames).have.length(1);
        should(newStackNames[0]).equal(stackNames[0]);

        await plugin.start(options);
        const obs = await plugin.observe(prevDom, dom);
        const actions = plugin.analyze(prevDom, dom, obs);
        should(actions.length).equal(1, "wrong number of actions");
        should(actions[0].description).match(/Destroying\s.+CFStack/);

        await act(actions);
        await plugin.finish();

        const stacks = await waitForStacks(
            client, deployID, newStackNames, {
                timeoutMs: 4 * 60 * 1000,
                terminalOnly: false,
                statusFilter: (s) => !isProbablyDeleted(s),
            });
        should(stacks).have.length(1, "wrong number of stacks");
        await checkStackStatus(stacks[0], "CREATE_COMPLETE", true, client);

        const deleted = await waitForStacks(
            client, deployID, [toDestroyStack], {
                timeoutMs: 4 * 60 * 1000,
                searchDeleted: true,
                terminalOnly: false,
                statusFilter: (s) => isProbablyDeleted(s),
            });
        should(deleted).have.length(1);
        should(deleted[0].StackName).equal(stackNames[1]);
        // TODO - check this? await checkStackStatus(deleted[0], "DELETE_COMPLETE");

        prevDom = dom;
        stepComplete++;
    });

    it("Should modify stack tag [step 4]", async () => {
        should(stepComplete).equal(3, "Previous test did not complete");

        // Just update the tag value
        domConfig.testTagVal = "newvalue";
        const orig = simpleDom(domConfig);
        const dom = await doBuild(orig, stateStore);
        const newStackNames = getStackNames(dom);

        // Stack name shouldn't change
        should(newStackNames).have.length(1);
        should(newStackNames[0]).equal(stackNames[0]);

        await plugin.start(options);
        const obs = await plugin.observe(prevDom, dom);
        const actions = plugin.analyze(prevDom, dom, obs);
        should(actions.length).equal(1, "wrong number of actions");
        should(actions[0].description).match(/Modifying\s.+CFStack/);

        await act(actions);
        await plugin.finish();

        const stacks = await waitForStacks(client, deployID, newStackNames,
                                           {timeoutMs: 4 * 60 * 1000});
        should(stacks).have.length(1, "wrong number of stacks");
        await checkStackStatus(stacks[0], "UPDATE_COMPLETE", true, client);

        // Did the tag update?
        should(getTag(stacks[0], "testTag")).equal("newvalue");

        prevDom = dom;
        stepComplete++;
    });

    it("Should modify stack to delete resource [step 5]", async () => {
        should(stepComplete).equal(4, "Previous test did not complete");
        if (instIds.length !== 2) throw new Error(`Previous test didn't find instances`);

        // Remove the FIRST instance from the first stack
        domConfig.secondInstance = false;
        const orig = simpleDom(domConfig);
        const dom = await doBuild(orig, stateStore);
        const newStackNames = getStackNames(dom);

        // Stack name shouldn't change
        should(newStackNames).have.length(1);
        should(newStackNames[0]).equal(stackNames[0]);

        await plugin.start(options);
        const obs = await plugin.observe(prevDom, dom);
        const actions = plugin.analyze(prevDom, dom, obs);
        should(actions.length).equal(1, "wrong number of actions");
        should(actions[0].description).match(/Modifying\s.+CFStack/);

        await act(actions);
        await plugin.finish();

        const stacks = await waitForStacks(client, deployID, newStackNames,
                                           {timeoutMs: 4 * 60 * 1000});
        should(stacks).have.length(1, "wrong number of stacks");
        await checkStackStatus(stacks[0], "UPDATE_COMPLETE", true, client);

        // The first instance should be deleted.
        const errMatch = RegExp(`Resource ${instIds[0].logical} does not exist`);
        await should(client.describeStackResource({
                StackName: stacks[0].StackId!,
                LogicalResourceId: instIds[0].logical,
            }).promise()).be.rejectedWith(errMatch);

        // The remaining active instance should have the physical ID of the
        // former second instance (testinstance2)
        const resp = await client.describeStackResource({
            StackName: stacks[0].StackId!,
            LogicalResourceId: instIds[1].logical,
        }).promise();
        if (!resp.StackResourceDetail) throw should(resp.StackResourceDetail).not.be.Null();

        should(resp.StackResourceDetail.PhysicalResourceId).equal(instIds[1].physical);
        should(resp.StackResourceDetail.ResourceType).equal("AWS::EC2::Instance");
        should(resp.StackResourceDetail.ResourceStatus).equal("UPDATE_COMPLETE");

        prevDom = dom;
        stepComplete++;
    });

});

describe("AWS plugin mock tests", () => {
    it("Should observe not see a stack where delete is in progress");
});
