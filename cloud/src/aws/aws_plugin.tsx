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
} from "@usys/adapt";
import { sha256hex } from "@usys/utils";
import * as AWS from "aws-sdk";
import { compact } from "lodash";

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

function addDeployIdTag(input: AWS.CloudFormation.CreateStackInput, deployID: string) {
    if (input.Tags == null) input.Tags = [];
    for (const t of input.Tags) {
        if (t.Key === adaptDeployIdTag) {
            t.Value = deployID;
            return;
        }
    }
    input.Tags.push({
        Key: adaptDeployIdTag,
        Value: deployID,
    });
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
    return stacks.filter((s) => {
        if (!s.Tags) return false;
        for (const t of s.Tags) {
            if (t.Key === adaptDeployIdTag && t.Value === deployID) return true;
        }
        return false;
    });
}

type AwsQD = QueryDomain<QDId, QDSecret>;
// tslint:disable:no-console

// Exported for testing
export class AwsPluginImpl
    extends GenericPlugin<CFStackProps, StackInfo, QDId, QDSecret> {

    findElems(dom: AdaptElementOrNull): AdaptElement<CFStackProps>[] {
        return findStackElems(dom);
    }
    getQueryDomain(el: AdaptElement<CFStackProps>) {
        return queryDomain(el);
    }
    getObservationType(_obs: StackInfo): string {
        return "CloudFormation Stack";
    }
    getObservationId(_obs: StackInfo): string {
        return "SOMEID";
    }
    getElemType(_el: AdaptElement<CFStackProps>): string {
        return "CloudFormation Stack";
    }
    getElemId(el: AdaptElement<CFStackProps>): string {
        return adaptStackId(el);
    }
    needsUpdate(el: AdaptElement<CFStackProps>, obs: StackInfo): boolean {
        console.log("needsupdate", el, obs);
        return true;
    }
    async getObservations(domain: AwsQD, deployID: string): Promise<StackInfo[]> {
        console.log("get", deployID, domain);

        const client = this.getClient(domain);
        const resp = await client.describeStacks().promise();
        console.log(`Got describeStacks`, resp);

        return filterStacks(resp.Stacks, deployID);
    }

    async createResource(
        deployID: string,
        resource: ResourcePair<AdaptElement<CFStackProps>, StackInfo>): Promise<void> {

        console.log("create", deployID, resource);
        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        const { key, awsCredentials, children, ...params } = el.props;
        addDeployIdTag(params, deployID);
        params.TemplateBody = JSON.stringify(createTemplate(el), null, 2);

        const client = this.getClient(queryDomain(el));
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
        deployID: string,
        resource: ResourcePair<AdaptElement<CFStackProps>, StackInfo>): Promise<void> {
        console.log("destroy", deployID, resource);
    }
    async updateResource(
        deployID: string,
        resource: ResourcePair<AdaptElement<CFStackProps>, StackInfo>): Promise<void> {
        console.log("update", deployID, resource);
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
