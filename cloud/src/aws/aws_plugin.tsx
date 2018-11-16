import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    findElementsInDom,
    Handle,
    isHandle,
    isMountedElement,
    QueryDomain,
    registerPlugin,
    Style,
    UpdateType,
    WidgetPair,
    WidgetPlugin,
} from "@usys/adapt";
import { isEqualUnorderedArrays, sha256hex } from "@usys/utils";
import AWS = require("aws-sdk");
import { compact, pick } from "lodash";

import {
    CFResource,
    CFResourceProps,
    isCFResourceElement,
} from "./CFResource";
import {
    CFStackPrimitive,
    CFStackPrimitiveProps,
    isCFStackPrimitiveElement,
} from "./CFStack";

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

interface AwsRegion {
    region: string;
    accessKeyId: string;
}
interface AwsSecret {
    awsSecretAccessKey: string;
}

type StackObs = AWS.CloudFormation.Stack;

interface LogicalRef {
    Ref: string;
}

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

export interface Tagged {
    Tags?: AWS.CloudFormation.Tag[];
}

export function getTag(obj: Tagged, tag: string) {
    if (obj.Tags) {
        for (const t of obj.Tags) {
            if (t.Key === tag) return t.Value;
        }
    }
    return undefined;
}

function cfLogicalRef(handle: Handle): LogicalRef {
    const el = handle.target;
    if (el == null) throw new Error(`Cannot get a CloudFormation ref for an unassociated handle`);
    if (!isCFResourceElement(el)) {
        throw new Error(`Cannot get a CloudFormation ref for an element that is not a CFResource`);
    }
    return { Ref: adaptResourceId(el) };
}

function addAdaptDeployId(input: AWS.CloudFormation.CreateStackInput, deployID: string) {
    addTag(input, adaptDeployIdTag, deployID);
}
export function getAdaptDeployId(stack: StackObs) {
    return getTag(stack, adaptDeployIdTag);
}

function addAdaptId(input: AWS.CloudFormation.CreateStackInput, id: string) {
    addTag(input, adaptIdTag, id);
}
export function getAdaptId(stack: StackObs) {
    return getTag(stack, adaptIdTag);
}

export function isStatusActive(status: AWS.CloudFormation.StackStatus) {
    switch (status) {
        case "CREATE_FAILED":
        case "DELETE_IN_PROGRESS":
        case "DELETE_COMPLETE":
            return false;
        default:
            return true;
    }
}

export function isStackActive(stack: StackObs) {
    return isStatusActive(stack.StackStatus);
}

// Exported for testing
export function createTemplate(stackEl: StackElement): Template {
    const template: Template = {
        AWSTemplateFormatVersion: TemplateFormatVersion.current,
        Resources: {},
    };

    const resources = findResourceElems(stackEl);
    for (const r of resources) {
        const properties = r.props.Properties;
        for (const k of Object.keys(properties)) {
            if (isHandle(properties[k])) {
                properties[k] = cfLogicalRef(properties[k]);
            }
        }
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

function queryDomain(stackEl: StackElement): AwsQueryDomain {
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

function adaptStackId(el: StackElement): string {
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

export function findStackElems(dom: AdaptElementOrNull): StackElement[] {
    const rules = <Style>{CFStackPrimitive} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isCFStackPrimitiveElement(e) ? e : null));
}

export function stacksWithDeployID(stacks: StackObs[] | undefined, deployID: string): StackObs[] {
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

interface StackParams extends Partial<AWS.CloudFormation.Stack> {
    TemplateBody?: string;
}

/**
 * Given a CFStackPrimitiveElement, creates a representation of the stack
 * that can be given to the client to create the stack.
 */
export function createStackParams(el: StackElement, deployID: string) {
    const { handle, key, awsCredentials, children, ...params } = el.props;
    addAdaptDeployId(params, deployID);
    addAdaptId(params, adaptStackId(el));
    params.TemplateBody = toTemplateBody(createTemplate(el));

    return { ...createDefaults, ...params };
}

const modifyProps: (keyof StackParams)[] = [
    "Capabilities",
    "Description",
    "EnableTerminationProtection", // UpdateTerminationProtection API
    "NotificationARNs",
    "Parameters",
    "RoleARN",
    "RollbackConfiguration",
    "Tags",
    "TemplateBody",
    // StackPolicyBody?
    // StackPolicyURL?
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
    el: StackElement,
    actual: StackObs,
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

type AwsQueryDomain = QueryDomain<AwsRegion, AwsSecret>;
type StackElement = AdaptElement<CFStackPrimitiveProps>;
type StackPair = WidgetPair<StackElement, StackObs>;

// Exported for testing
export class AwsPluginImpl
    extends WidgetPlugin<StackElement, StackObs, AwsQueryDomain> {

    findElems = (dom: AdaptElementOrNull): StackElement[] => {
        return findStackElems(dom);
    }
    getElemQueryDomain = (el: StackElement) => {
        return queryDomain(el);
    }
    getWidgetTypeFromObs = (_obs: StackObs): string => {
        return "CloudFormation Stack";
    }
    getWidgetIdFromObs = (obs: StackObs): string => {
        return getAdaptId(obs) || obs.StackId || obs.StackName;
    }
    getWidgetTypeFromElem = (_el: StackElement): string => {
        return "CloudFormation Stack";
    }
    getWidgetIdFromElem = (el: StackElement): string => {
        return adaptStackId(el);
    }

    needsUpdate = (el: StackElement, obs: StackObs): UpdateType => {
        return compareStack(el, obs, this.deployID);
    }

    getObservations = async (domain: AwsQueryDomain, deployID: string): Promise<StackObs[]> => {
        const client = this.getClient(domain);
        const resp = await client.describeStacks().promise();

        const stacks = stacksWithDeployID(resp.Stacks, deployID)
            .filter((stk) => isStackActive(stk));
        let s: StackParams;
        for (s of stacks) {
            const r = await client.getTemplate({
                StackName: s.StackId || s.StackName
            }).promise();
            s.TemplateBody = r.TemplateBody;
        }
        return stacks;
    }

    createWidget = async (
        domain: AwsQueryDomain,
        deployID: string,
        resource: StackPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        const params = createStackParams(el, deployID);
        const client = this.getClient(domain);
        await client.createStack(params).promise();
    }

    destroyWidget = async (
        domain: AwsQueryDomain,
        _deployID: string,
        resource: StackPair): Promise<void> => {

        const stackName =
            resource.observed && (resource.observed.StackId || resource.observed.StackName);
        if (!stackName) throw new Error(`Unable to delete stack that doesn't exist`);

        const client = this.getClient(domain);
        await client.deleteStack({ StackName: stackName }).promise();
    }

    modifyWidget = async (
        domain: AwsQueryDomain,
        deployID: string,
        resource: StackPair): Promise<void> => {

        const stackName =
            resource.observed && (resource.observed.StackId || resource.observed.StackName);
        if (!stackName) throw new Error(`Unable to update stack that doesn't exist`);

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        const updateable = pick(createStackParams(el, deployID), modifyProps);
        // tslint:disable-next-line:no-object-literal-type-assertion
        const params = { StackName: stackName, ...updateable } as AWS.CloudFormation.UpdateStackInput;
        const client = this.getClient(domain);

        await client.updateStack(params).promise();
    }

    getClient(domain: AwsQueryDomain) {
        // TODO(mark): Cache a client for each domain.
        return new AWS.CloudFormation({
            region: domain.id.region,
            accessKeyId: domain.id.accessKeyId,
            secretAccessKey: domain.secret.awsSecretAccessKey,
        });
    }
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
