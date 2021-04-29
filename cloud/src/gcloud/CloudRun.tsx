/*
 * Copyright 2020-2021 Unbounded Systems, LLC
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
import * as ld from "lodash";

import { Action, ActionContext, ShouldAct } from "../action";
import { makeResourceName } from "../common";
import { useLatestImageFrom } from "../Container";
import { RegistryDockerImage } from "../docker";
import { Environment, mergeEnvSimple } from "../env";

import {
    cloudRunDelete,
    cloudRunDeploy,
    cloudRunDescribe,
    cloudRunUpdateTraffic,
    Config
} from "./commands";

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
    args?: string[];
    /** Image from which to start the container */
    image: string;
    /**
     * Name of the Cloud Run service in gcloud
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
     *
     * CloudRun can send traffic to multiple revisions of the same
     * service.  Every deploy to cloud run creates a new revision. After
     * health checks pass, the latest container will receive trafficPct/100
     * of the total traffic.  Set this to 100 to ensure that the
     * latest deployment gets all the traffic once up and running, set it to 0
     * for the latest version to get no traffic.
     *
     * NOTE: This value ranges from 0 to 100, not 0.0 to 1.0
     */
    trafficPct: number;
    /**
     * CPU resources that can be consumed by this CloudRun deployment
     *
     * @remarks
     * This is a Kubernetes style cpu specification string.
     * 1 is 1 cpu, 2 is 2 cpus, 100m is 100minutes of CPU allocation, etc.
     *
     * Please look at Google's Cloud Run documentation for more information and any
     * restrictions vs. Kubernetes.
     */
    cpu: string | number;
    /**
     * Memory allocated to this deployment
     *
     * @remarks
     * This is a Kubernetes style string.  128Mi is 128 Mibibytes, etc.
     *
     * Please look at Google's Cloud Run documentation for more information
     * and any restrictions vs. Kubernetes.
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
    /**
     * Specify a gcloud configuration to use
     *
     * @remarks
     * For unit test use only, functionality may change or disappear.
     *
     * @internal
     */
    configuration?: string;
}

/**
 * Instance methods for the {@link gcloud.CloudRun} component.
 *
 * @public
 */
export interface CloudRunInstance {
    /** Returns the https URL for the Cloud Run service. */
    url(): Promise<string | undefined>;
}

/**
 * State for the {@link gcloud.CloudRun} component.
 *
 * @public
 */
export interface CloudRunState {
    /** URL for the service the last time it was queried (may not be current). */
    url?: string;
}

/**
 * Primitive Component for GCP Cloud Run deployments
 * @public
 */
export class CloudRun extends Action<CloudRunProps, CloudRunState> implements CloudRunInstance {

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

        const oldManifest = await this.describe();

        switch (op) {
            case ChangeType.create:
            case ChangeType.modify:
            case ChangeType.replace:
                // See Issue #220
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
        const info = await this.describe();
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
                //See Issue #220
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
        const statObj = await this.describe();
        if (goalStatus === DeployStatus.Destroyed) {
            if (statObj === undefined) return true;
            return waiting(`Waiting for CloudRun deployment to be destroyed`);
        }
        if (statObj == null) {
            return waiting(`Waiting for CloudRun deployment to be created`);
        }
        return isReady(statObj);
    }

    async url(): Promise<string | undefined> {
        const statObj: any = await this.describe();
        return statObj?.status?.url;
    }

    initialState() { return {}; }

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
            args: this.props.args || [],
            image: this.props.image,
            port: this.props.port,
            region: this.props.region,
            cpu: this.props.cpu,
            memory: this.props.memory,
            trafficPct: this.props.trafficPct,
            allowUnauthenticated: this.props.allowUnauthenticated,
            globalOpts: {
                configuration: this.props.configuration
            }
        };
        return this.config_;
    }

    private async describe() {
        const statObj: any = await cloudRunDescribe(this.config(this.deployInfo.deployID));
        const url: string | undefined = statObj?.status?.url;
        this.setState({ url });
        return statObj;
    }
}

function isReady(status: any) {
    if (!status || !status.status) return waiting(`CloudRun cluster returned invalid status for Pod`);
    if (status.status.phase === "Running") return true;
    if (status.status.conditions == null) return waiting("Waiting for CloudRun conditions");
    if (!Array.isArray(status.status.conditions)) return waiting("Waiting for CloudRun to populate conditions");
    const conditions: any[] = status.status.conditions;

    // For Knative, which CloudRun is based on,
    // if there is a condition with type Ready and it is True,
    // all conditions are satisfied for readiness.
    //
    // Note(manishv)  It is unclear to me if this means all other conditions
    // must also be true, or that there will be no new conditions added later
    // but this check seems to suffice.
    const ready = conditions
        .find((cond: any) => (cond.status === "True" && cond.type === "Ready"));
    if (ready !== undefined) return true;

    // If there is no Ready condition type, or it is not True,
    // The status of all other false conditions gives us the best information
    // on why the service is not ready yet.
    let msg = "CloudRun not ready";
    const notReady = conditions
        .filter((cond: any) => cond.status !== "True")
        .map((cond: any) => cond.message)
        .join("; ");
    if (notReady) msg += `: ${notReady}`;
    return waiting(msg);
}

/**
 * Exported for testing only
 *
 * @internal
 */
export const makeCloudRunName = makeResourceName(/[^a-z-]/g, 63);

/**
 * Props for the {@link gcloud.CloudRunAdapter} component
 *
 * @beta
 */
export type CloudRunAdapterProps =
    SFCDeclProps<Omit<CloudRunProps, "image"> & {
        image: Handle,
        registryPrefix: string
    } & Partial<BuiltinProps>, typeof CloudRun.defaultProps>;

/**
 * Temporary adapter to allow handle for image
 *
 * @beta
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
            registryPrefix={props.registryPrefix} />
        {crElem}
    </Sequence>;
}
