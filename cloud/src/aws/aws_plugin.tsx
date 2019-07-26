import Adapt, {
    ActionInfo,
    AdaptElementOrNull,
    ChangeType,
    FinalDomElement,
    findElementsInDom,
    Handle,
    isHandle,
    QueryDomain,
    registerPlugin,
    Style,
    WidgetChange,
    WidgetPair,
    WidgetPlugin,
} from "@adpt/core";
import { isEqualUnorderedArrays } from "@adpt/utils";
import AWS = require("aws-sdk");
import { compact, pick } from "lodash";

import {
    CFResourcePrimitive,
    CFResourceProps,
    isCFResourcePrimitiveElement,
} from "./CFResource";
import {
    CFStackPrimitive,
    CFStackPrimitiveProps,
    isCFStackPrimitiveFinalElement,
} from "./CFStack";
import {
    adaptDeployIdTag,
    adaptIdFromElem,
    adaptResourceId,
    adaptResourceIdTag,
    adaptStackIdTag,
    addTag,
    getTag,
    Tagged,
} from "./plugin_utils";

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

function cfLogicalRef(handle: Handle): LogicalRef {
    return { Ref: adaptResourceId(handle) };
}

function addAdaptDeployId(input: AWS.CloudFormation.CreateStackInput, deployID: string) {
    addTag(input, adaptDeployIdTag, deployID);
}
export function getAdaptDeployId(stack: StackObs) {
    return getTag(stack, adaptDeployIdTag);
}

function addAdaptStackId(input: AWS.CloudFormation.CreateStackInput, id: string) {
    addTag(input, adaptStackIdTag, id);
}
export function getAdaptStackId(stack: StackObs) {
    return getTag(stack, adaptStackIdTag);
}

function addAdaptResourceId(input: Tagged, id: ResourceId) {
    addTag(input, adaptResourceIdTag, id);
}
export function getAdaptResourceId(item: Tagged) {
    return getTag(item, adaptResourceIdTag);
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
        const resourceId = adaptResourceId(r);
        // Don't modify the element's props. Clone.
        const properties = { ...r.props.Properties };

        for (const k of Object.keys(properties)) {
            if (isHandle(properties[k])) {
                properties[k] = cfLogicalRef(properties[k]);
            }
        }

        if (!r.props.tagsUnsupported) {
            // Don't modify the tags on the element either
            properties.Tags = properties.Tags ? properties.Tags.slice() : [];
            addAdaptResourceId(properties, resourceId);
        }

        template.Resources[resourceId] = {
            Type: r.props.Type,
            Properties: properties,
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
    return adaptIdFromElem("CFStack", el);
}

function findResourceElems(dom: AdaptElementOrNull) {
    const rules = <Style>{CFResourcePrimitive} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isCFResourcePrimitiveElement(e) ? e : null));
}

export function findStackElems(dom: AdaptElementOrNull): StackElement[] {
    const rules = <Style>{CFStackPrimitive} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isCFStackPrimitiveFinalElement(e) ? e : null));
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
    addAdaptStackId(params, adaptStackId(el));
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

export function computeStackChanges(
    change: WidgetChange<StackElement>,
    actual: StackObs | undefined,
    deployID: string,
): ActionInfo {
    const { to, from } = change;

    const getElems = () => {
        const els: FinalDomElement[] = [];
        const root = to || from || null;
        if (root) els.push(root as FinalDomElement);
        return els.concat(findResourceElems(root));
    };

    // TODO: Ask AWS for detail on resource changes via change set API
    const actionInfo = (type: ChangeType, detail: string, elDetailTempl = detail) => ({
        type,
        detail,
        changes: getElems().map((element) => {
            const elDetail = element.componentType === CFStackPrimitive ? detail :
                elDetailTempl.replace("{TYPE}", element.props.Type || "resource");
            return {
                type,
                element,
                detail: elDetail,
            };
        })
    });

    if (from == null && to == null) {
        return actionInfo(ChangeType.delete, "Destroying unrecognized CFStack");
    }

    if (to == null) {
        return actual ?
            actionInfo(ChangeType.delete, "Destroying CFStack",
                "Destroying {TYPE} due to CFStack deletion") :
            actionInfo(ChangeType.none, "No changes required");
    }

    if (actual == null) {
        return actionInfo(ChangeType.create, "Creating CFStack", "Creating {TYPE}");
    }

    const expected = createStackParams(to, deployID);
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
        return actionInfo(ChangeType.replace, "Replacing CFStack",
            "Replacing {TYPE} due to replacing CFStack");
    }
    if (!areEqual<StackParams>(expected, actual, modifyProps)) {
        // TODO: Because we're modifying the stack, each resource within the
        // stack could be created, deleted, updated, or replaced...we must
        // ask the AWS API to know.
        return actionInfo(ChangeType.modify, "Modifying CFStack",
            "Resource {TYPE} may be affected by CFStack modification");
    }

    return actionInfo(ChangeType.none, "No changes required");
}

type AwsQueryDomain = QueryDomain<AwsRegion, AwsSecret>;
type StackElement = FinalDomElement<CFStackPrimitiveProps>;
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
        return getAdaptStackId(obs) || obs.StackId || obs.StackName;
    }
    getWidgetTypeFromElem = (_el: StackElement): string => {
        return "CloudFormation Stack";
    }
    getWidgetIdFromElem = (el: StackElement): string => {
        return adaptStackId(el);
    }

    computeChanges = (change: WidgetChange<StackElement>, obs: StackObs | undefined): ActionInfo => {
        return computeStackChanges(change, obs, this.deployID);
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
