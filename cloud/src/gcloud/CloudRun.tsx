/*
 * Copyright 2020 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Adapt, {
    AdaptElement,
    AdaptMountedElement,
    BuiltinProps,
    ChangeType,
    childrenToArray,
    DeployStatus,
    GoalStatus,
    Handle,
    handle,
    Sequence,
    SFCBuildProps,
    SFCDeclProps,
    useBuildHelpers,
    waiting
} from "@adpt/core";
import { InternalError, Omit } from "@adpt/utils";
import db from "debug";
import execa, { ExecaError } from "execa";
import * as ld from "lodash";

import { Action, ActionContext, ShouldAct } from "../action";
import { makeResourceName } from "../common";
import { useLatestImageFrom } from "../Container";
import { RegistryDockerImage } from "../docker";
import { Environment, EnvSimple, mergeEnvSimple } from "../env";

interface Config {
    name: string;
    env: EnvSimple;
    args: EnvSimple;
    image: string;
    region: string;
    port: number;
    trafficPct: number;
    cpu: string | number;
    memory: string | number;
    allowUnauthenticated: boolean;
}

const debug = db("adapt:cloud:gcloud");

type Manifest = any;

/**
 * Decides if an existing Run deployment is scheduled for deletion
 */
function isDeleting(info: Manifest | undefined): boolean {
    return (info !== undefined) && ("deletionTimestamp" in info.metadata);
}

/**
 * Props for the {@link gcloud.CloudRun} component
 *
 * @public
 */
export interface CloudRunProps {
    /** Environment for the container in the deployment */
    env?: Environment;
    /** Arguments for the container entrypoint */
    args?: Environment;
    /** Image from which to start the container */
    image: string;
    /**
     * Name of the service is gcloud
     *
     * @remarks
     * This is the absolute name of the service to use.  If not specified
     * Adapt will automatically generate a name for the service.
     */
    serviceName?: string;
    /** Region in which to create the cloud run deployment */
    region: string;
    /**
     * Port on which the container will listen
     *
     * @remarks
     * The container must listen on this port.  There is no port mapping
     * in CloudRun.  However, this will set the `PORT` environment variable
     * for the container, and so the container can listen on this port
     * to get the effect of port mapping.
     */
    port: number;
    /**
     * Percentage of traffic for the latest revision of the deployment
     *
     * @remarks
     * CloudRun can send traffic to multiple revisions of the same
     * service.  Every deploy to cloud run creates a new revision. After
     * health checks pass, the latest container will receive trafficPct
     * of the total traffic.  Set this to 100% to ensure that the
     * latest deployment gets all the traffic once up and running.
     */
    trafficPct: number;
    /**
     * CPU resources that can be consumed by this CloudRun deployment
     *
     * @remarks
     * This is a Kubernetes style cpu specification string.
     * 1 is 1 cpu, 2 is 2 cpus, 100m is 100minutes of CPU allocation, etc.
     */
    cpu: string | number;
    /**
     * Memory allocated to this deployment
     *
     * @remarks
     * This is a Kubernetes style string.  128Mi is 128 Mibibytes, etc.
     */
    memory: string | number;
    /**
     * Allow public access to this service
     *
     * @remarks
     * If set to `true`, the service will be public.  Otherwise,
     * authentication will be required to access the service from outside
     * the project.
     */
    allowUnauthenticated: boolean;
}

async function cloudRunDescribe(config: Config): Promise<Manifest> {
    try {
        const result = await execGcloud([
            "run",
            "services",
            "describe",
            "--quiet",
            "--platform=managed",
            "--format=json",
            `--region=${config.region}`,
            config.name
        ]);

        return JSON.parse(result.stdout);
    } catch (e) {
        if (isExecaError(e) && e.exitCode !== 0 && e.stderr.match(/Cannot find service/)) {
            return undefined;
        }
        throw e;
    }
}

async function cloudRunDeploy(config: Config): Promise<void> {
    const env = config.env;
    const args = config.args;
    const envString = Object.entries(env).map(([k, v]) => `${k}=${v}`).join(",");
    const argsString = Object.entries(args).map(([k, v]) => `${k}=${v}`).join(",");
    const authArg = config.allowUnauthenticated
        ? "--allow-unauthenticated"
        : "--no-allow-unauthenticated";

    const gcargs = [
        "run",
        "deploy",
        config.name,
        "--quiet",
        "--platform=managed",
        "--format=json",
        authArg,
        `--memory=${config.memory}`,
        `--cpu=${config.cpu}`,
        `--image=${config.image}`,
        `--region=${config.region}`,
        `--port=${config.port}`,
        `--set-env-vars=${envString}`,
        `--args=${argsString}`
    ];

    await execGcloud(gcargs);
}

async function cloudRunUpdateTraffic(config: Config): Promise<void> {
    const gcargs = [
        "run",
        "services",
        "update-traffic",
        config.name,
        "--quiet",
        "--platform=managed",
        "--format=json",
        `--region=${config.region}`,
        `--to-revisions`,
        `LATEST=${config.trafficPct}`
    ];

    await execGcloud(gcargs);
}

async function cloudRunDelete(config: Config): Promise<void> {
    try {
        await execGcloud([
            "run",
            "services",
            "delete",
            config.name,
            "--quiet",
            "--platform=managed",
            "--format=json",
            `--region=${config.region}`
        ]);
    } catch (e) {
        if (isExecaError(e) && e.exitCode !== 0 && e.stderr.match(/Cannot find service/)) {
            return undefined;
        }
        throw e;
    }
}

/**
 * Primitive Component for GCP Cloud Run deployments
 * @public
 */
export class CloudRun extends Action<CloudRunProps> {

    static defaultProps = {
        trafficPct: 100,
        memory: "128M",
        cpu: 1,
        allowUnauthenticated: false
    };

    config_: Config;

    constructor(props: CloudRunProps) {
        super(props);
    }

    validate() {
        const children = childrenToArray((this.props as any).children);

        if (!ld.isEmpty(children)) return "Resource elements cannot have children";

        if ((this.props.port) < 1 || (this.props.port > 65535)) {
            throw new Error(`Invalid port ${this.props.port} (must be between 1 and 65535)`);
        }

        if ((this.props.trafficPct <= 0) || (this.props.trafficPct > 100)) {
            throw new Error(`Invalid trafficPct ${this.props.trafficPct} (must be an integer between 1 and 100)`);
        }

        //Do other validations of config here
        return;
    }

    async shouldAct(op: ChangeType, ctx: ActionContext): Promise<ShouldAct> {
        const deployID = ctx.buildData.deployID;
        const config = this.config(deployID);
        const name = config.name;

        const oldManifest = await cloudRunDescribe(config);

        switch (op) {
            case ChangeType.create:
            case ChangeType.modify:
            case ChangeType.replace:
                if (oldManifest === undefined || isDeleting(oldManifest)) {
                    return {
                        act: true,
                        detail: `Creating CloudRun deployment ${name}`
                    };
                } else {
                    return { act: true, detail: `Updating CloudRun deployment ${name}` };
                }
            case ChangeType.delete:
                if (oldManifest && !isDeleting(oldManifest)) {
                    return {
                        act: true,
                        detail: `Deleting CloudRun deployment ${name}`
                    };
                }
                return false;
            case ChangeType.none:
                return false;
        }
    }

    async action(op: ChangeType, ctx: ActionContext): Promise<void> {
        const deployID = ctx.buildData.deployID;
        const config = this.config(deployID);
        const info = await cloudRunDescribe(config);
        let deleted = false;

        if (isDeleting(info)) {
            //Wait for deleting to complete, else create/modify/apply will fail
            await cloudRunDelete(config);
            deleted = true;
        }

        switch (op) {
            case ChangeType.create:
            case ChangeType.modify:
            case ChangeType.replace:
                await cloudRunDeploy(config);
                await cloudRunUpdateTraffic(config);
                return;
            case ChangeType.delete:
                if (deleted) return;
                await cloudRunDelete(config);
                return;
            case ChangeType.none:
                return;
        }
    }

    deployedWhen = async (goalStatus: GoalStatus) => {
        const statObj = await cloudRunDescribe(this.config(this.deployInfo.deployID));
        if (statObj === undefined) return true;
        if (goalStatus === DeployStatus.Destroyed) {
            return waiting(`Waiting for CloudRun deployment to be destroyed`);
        }
        return isReady(statObj);
    }

    private mountedElement(): AdaptMountedElement<CloudRunProps> {
        const hand = this.props.handle;
        if (hand === undefined) throw new InternalError("element requested but props.handle undefined");
        const elem = hand.mountedOrig;
        if (elem == null) throw new InternalError(`element requested but handle.mountedOrig is ${elem}`);
        return elem as AdaptMountedElement<CloudRunProps>;
    }

    private config(deployID: string): Config {
        if (this.config_) return this.config_;
        const elem = this.mountedElement();
        const key = this.props.key;
        if (key == null) throw new Error("Internal Error: key is falsey");
        this.config_ = {
            name: this.props.serviceName || makeCloudRunName(key, elem.id, deployID),
            env: mergeEnvSimple(this.props.env) || {},
            args: mergeEnvSimple(this.props.args) || {},
            image: this.props.image,
            port: this.props.port,
            region: this.props.region,
            cpu: this.props.cpu,
            memory: this.props.memory,
            trafficPct: this.props.trafficPct,
            allowUnauthenticated: this.props.allowUnauthenticated
        };
        return this.config_;
    }
}

function isReady(status: any) {
    if (!status || !status.status) return waiting(`Kubernetes cluster returned invalid status for Pod`);
    if (status.status.phase === "Running") return true;
    if (status.status.conditions == null) return waiting("Waiting for CloudRun conditions");
    if (!Array.isArray(status.status.conditions)) return waiting("Waiting for CloudRun to populate conditions");
    const conditions: any[] = status.status.conditions;

    const ready = conditions
        .find((cond: any) => (cond.status === "True" && cond.type === "Ready"));
    if (ready !== undefined) return true;

    let msg = "CloudRun not ready";
    const notReady = conditions
        .filter((cond: any) => cond.status !== "True")
        .map((cond: any) => cond.message)
        .join("; ");
    if (notReady) msg += `: ${notReady}`;
    return waiting(msg);
}

const makeCloudRunName = makeResourceName(/[^a-z-]/g, 63);

export type CloudRunAdapterProps =
    SFCDeclProps<Omit<CloudRunProps, "image"> & {
        image: Handle,
        registryUrl: string
    } & Partial<BuiltinProps>, typeof CloudRun.defaultProps>;

/**
 * Temporary adapter to allow handle for image
 */
export function CloudRunAdapter(propsIn: CloudRunAdapterProps) {
    const props = propsIn as SFCBuildProps<CloudRunAdapterProps>;
    const { handle: origHandle, ...propsNoHandle } = props;

    const cloudRun = handle();
    const regImage = handle();

    const helpers = useBuildHelpers();
    const image = useLatestImageFrom(regImage);
    let crElem: AdaptElement | null = null;
    if (image) {
        const crProps = { ...propsNoHandle, image };
        crElem = <CloudRun handle={cloudRun} {...(crProps as any)} />;
        origHandle.replaceTarget(crElem, helpers);
    }

    return <Sequence>
        <RegistryDockerImage handle={regImage}
            imageSrc={props.image}
            registryUrl={props.registryUrl} />
        {crElem}
    </Sequence>;
}

export async function execGcloud(args: string[], options: execa.Options = {}) {
    const execaOpts = {
        all: true,
        ...options,
    };

    debug(`Running: gcloud ${args.join(" ")}`);
    try {
        const ret = execa("gcloud", args, execaOpts);
        return await ret;
    } catch (e) {
        if (isExecaError(e) && e.all) e.message += "\n" + e.all;
        debug(`Failed: gcloud ${args.join(" ")}: ${e.message}`);
        throw e;
    }
}

export function isExecaError(e: Error): e is ExecaError {
    if (!e.message.startsWith("Command failed")) return false;
    if (!("exitCode" in e)) return false;
    return true;
}
