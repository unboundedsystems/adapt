import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    findElementsInDom,
    GenericPlugin,
    isMountedElement,
    QueryDomain,
    registerPlugin,
    ResourcePair,
    Style,
    UpdateType,
} from "@usys/adapt";
import { isEqualUnorderedArrays, sha256hex } from "@usys/utils";
import * as AWS from "aws-sdk";
import { compact, pick } from "lodash";

import {
    CFResource,
    CFResourceProps,
    CFStackBase,
    CFStackProps,
    isCFResourceElement,
    isCFStackElement,
} from ".";

export enum TemplateFormatVersion {
    current = "2010-09-09",
}

export type ResourceId = string;
export interface Resources {
    [ id: string ]: CFResourceProps; // id is ResourceId
}

export interface Template {
    AWSTemplateFormatVersion?: TemplateFormatVersion;
    Description?: string;
    Metadata?: any;
    Parameters?: any;
    Mappings?: any;
    Conditions?: any;
    Transform?: any;
    Resources: Resources;
    Outputs?: any;
}

interface QDId {
    region: string;
    accessKeyId: string;
}
interface QDSecret {
    awsSecretAccessKey: string;
}

type StackInfo = AWS.CloudFormation.Stack;

const adaptDeployIdTag = "adapt:deployID";
const adaptIdTag = "adapt:ID";

function addTag(input: AWS.CloudFormation.CreateStackInput, tag: string, value: string) {
    if (input.Tags == null) input.Tags = [];
    for (const t of input.Tags) {
        if (t.Key === tag) {
            t.Value = value;
            return;
        }
    }
    input.Tags.push({
        Key: tag,
        Value: value,
    });
}

export function getTag(stack: StackInfo, tag: string) {
    if (stack.Tags) {
        for (const t of stack.Tags) {
            if (t.Key === tag) return t.Value;
        }
    }
    return undefined;
}

function addAdaptDeployId(input: AWS.CloudFormation.CreateStackInput, deployID: string) {
    addTag(input, adaptDeployIdTag, deployID);
}
export function getAdaptDeployId(stack: StackInfo) {
    return getTag(stack, adaptDeployIdTag);
}

function addAdaptId(input: AWS.CloudFormation.CreateStackInput, id: string) {
    addTag(input, adaptIdTag, id);
}
export function getAdaptId(stack: StackInfo) {
    return getTag(stack, adaptIdTag);
}

// Exported for testing
export function createTemplate(stackEl: AdaptElement<CFStackProps>): Template {
    const template: Template = {
        AWSTemplateFormatVersion: TemplateFormatVersion.current,
        Resources: {},
    };

    const resources = findResourceElems(stackEl);
    for (const r of resources) {
        template.Resources[adaptResourceId(r)] = {
            Type: r.props.Type,
            Properties: r.props.Properties,
        };
    }

    return template;
}

function toTemplateBody(template: Template): string {
    return JSON.stringify(template, null, 2);
}

function queryDomain(stackEl: AdaptElement<CFStackProps>): QueryDomain<QDId, QDSecret> {
    const creds = stackEl.props.awsCredentials;
    if (creds == null)  throw new Error(`Required AWS credentials not set`);

    const id = {
        region: creds.awsRegion,
        accessKeyId: creds.awsAccessKeyId,
    };
    const secret = {
        awsSecretAccessKey: creds.awsSecretAccessKey,
    };
    return { id, secret };
}

function adaptStackId(el: AdaptElement<CFStackProps>): string {
    return adaptId("CFStack", el);
}

function adaptResourceId(el: AdaptElement<CFResourceProps>): ResourceId {
    return adaptId(el.props.Type, el);
}

function adaptId(prefix: string, el: AdaptElement<{}>): string {
    const replaceRe = /[^a-z0-9]/ig;
    if (!isMountedElement(el)) {
        throw new Error("Can only compute name of mounted elements");
    }
    const name = prefix + sha256hex(el.id).slice(0, 32);
    // Remove all invalid chars
    return name.replace(replaceRe, "");
}

function findResourceElems(dom: AdaptElementOrNull): AdaptElement<CFResourceProps>[] {
    const rules = <Style>{CFResource} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isCFResourceElement(e) ? e : null));
}

export function findStackElems(dom: AdaptElementOrNull): AdaptElement<CFStackProps>[] {
    const rules = <Style>{CFStackBase} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isCFStackElement(e) ? e : null));
}

export function filterStacks(stacks: StackInfo[] | undefined, deployID: string): StackInfo[] {
    if (stacks == null) return [];
    return stacks.filter((s) => (getAdaptDeployId(s) === deployID));
}

const createDefaults = {
    Capabilities: [],
    NotificationARNs: [],
    Parameters: [],
    Tags: [],
    RollbackConfiguration: {},
};

export function createStackParams(el: AdaptElement<CFStackProps>, deployID: string) {
    const { key, awsCredentials, children, ...params } = el.props;
    addAdaptDeployId(params, deployID);
    addAdaptId(params, adaptStackId(el));
    params.TemplateBody = toTemplateBody(createTemplate(el));

    return { ...createDefaults, ...params };
}

const modifyProps: (keyof StackParams)[] = [
    "Capabilities",
    "Description",
    "DisableRollback",
    "EnableTerminationProtection", // UpdateTerminationProtection API
    "NotificationARNs",
    "Parameters",
    "RoleARN",
    "RollbackConfiguration",
    "Tags",
    "TemplateBody",
    // Stack policy?
];
const replaceProps: (keyof StackParams)[] = [
    "StackName", // Have to replace?
];

interface StackParams extends Partial<AWS.CloudFormation.Stack> {
    TemplateBody?: string;
}

function areEqual<T extends object>(
    expected: T,
    actual: T,
    propsToCompare: (keyof T)[],
) {
    const exp = pick(expected, propsToCompare);
    const act = pick(actual, propsToCompare);
    return isEqualUnorderedArrays(exp, act);
}

export function compareStack(
    el: AdaptElement<CFStackProps>,
    actual: StackInfo,
    deployID: string,
): UpdateType {

    const expected = createStackParams(el, deployID);
    // Ugh. Special case. OnFailure doesn't show up in describeStacks output,
    // but instead transforms into DisableRollback.
    const onFailure = expected.OnFailure;
    switch (onFailure) {
        case "DO_NOTHING":
            expected.DisableRollback = true;
            break;
        case "DELETE":
        case "ROLLBACK":
            expected.DisableRollback = false;
            break;
    }

    if (!areEqual<StackParams>(expected, actual, replaceProps)) {
        return UpdateType.replace;
    }
    if (!areEqual<StackParams>(expected, actual, modifyProps)) {
        return UpdateType.modify;
    }

    return UpdateType.none;
}

type AwsQD = QueryDomain<QDId, QDSecret>;
// tslint:disable:no-console

// Exported for testing
export class AwsPluginImpl
    extends GenericPlugin<CFStackProps, StackInfo, QDId, QDSecret> {

    findElems(dom: AdaptElementOrNull): AdaptElement<CFStackProps>[] {
        return findStackElems(dom);
    }
    getElemQueryDomain(el: AdaptElement<CFStackProps>) {
        return queryDomain(el);
    }
    getObservationType(_obs: StackInfo): string {
        return "CloudFormation Stack";
    }
    getObservationId(obs: StackInfo): string {
        return getAdaptId(obs) || obs.StackId || obs.StackName;
    }
    getElemType(_el: AdaptElement<CFStackProps>): string {
        return "CloudFormation Stack";
    }
    getElemId(el: AdaptElement<CFStackProps>): string {
        return adaptStackId(el);
    }

    needsUpdate(el: AdaptElement<CFStackProps>, obs: StackInfo): UpdateType {
        if (!this.deployID) throw new Error(`deployID cannot be null`);

        return compareStack(el, obs, this.deployID);
    }

    async getObservations(domain: AwsQD, deployID: string): Promise<StackInfo[]> {
        console.log("get", deployID, domain);

        const client = this.getClient(domain);
        const resp = await client.describeStacks().promise();

        const stacks = filterStacks(resp.Stacks, deployID);
        let s: StackParams;
        for (s of stacks) {
            const r = await client.getTemplate({
                StackName: s.StackId || s.StackName
            }).promise();
            s.TemplateBody = r.TemplateBody;
        }
        return stacks;
    }

    async createResource(
        domain: AwsQD,
        deployID: string,
        resource: ResourcePair<AdaptElement<CFStackProps>, StackInfo>): Promise<void> {

        console.log("create", deployID, resource);
        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        const params = createStackParams(el, deployID);
        const client = this.getClient(domain);
        try {
            const resp = await client.createStack(params).promise();
            const stackId = resp.StackId || "<Unknown StackId>";
            this.log(`Created ${stackId}`);
        } catch (err) {
            throw new Error(
                `An error occurred while creating stack '${el.props.StackName}'` +
                `${getPath(el)}: ${err.message || err}`);
        }
    }

    async destroyResource(
        domain: AwsQD,
        deployID: string,
        resource: ResourcePair<AdaptElement<CFStackProps>, StackInfo>): Promise<void> {

        console.log("destroy", deployID, resource);
        const stackName =
            resource.observed && (resource.observed.StackId || resource.observed.StackName);
        if (!stackName) throw new Error(`Unable to delete stack that doesn't exist`);

        const client = this.getClient(domain);
        await client.deleteStack({ StackName: stackName }).promise();
    }

    async updateResource(
        domain: AwsQD,
        deployID: string,
        resource: ResourcePair<AdaptElement<CFStackProps>, StackInfo>): Promise<void> {
        console.log("update", domain, deployID, resource);
    }

    getClient(domain: AwsQD) {
        return new AWS.CloudFormation({
            region: domain.id.region,
            accessKeyId: domain.id.accessKeyId,
            secretAccessKey: domain.secret.awsSecretAccessKey,
        });
    }
}

function getPath(el: AdaptElement<AnyProps>): string {
    if (isMountedElement(el)) return ` [${el.path}]`;
    return "";
}

// Exported for testing
export function createAwsPlugin() {
    return new AwsPluginImpl();
}

registerPlugin({
    name: "aws",
    module,
    create: createAwsPlugin,
});
