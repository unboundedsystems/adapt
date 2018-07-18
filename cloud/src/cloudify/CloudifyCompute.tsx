import {
    filterProperties,
    PrimitiveComponent,
    UpdateStateInfo
} from "@usys/adapt";

import { ComputeProps } from "../Compute";

import { getBlueprintState } from "./Blueprint";

export interface AgentConfig {
    install_method?: string;
    service_name?: string;
    network?: string;
    user?: string;
    key?: string;
    password?: string;
    port?: number;
    process_management?: object;
    min_workers?: number;
    max_workers?: number;
    disable_requiretty?: boolean;
    env?: object;
    extra?: object;
}

export interface CloudifyComputeProps extends ComputeProps {
    os_family?: string;
    agent_config?: AgentConfig;

    // DEPRECATED
    install_agent?: string;
    cloudify_agent?: object;
}

export class CloudifyCompute extends PrimitiveComponent<CloudifyComputeProps, {}> {
    updateState(state: any, info: UpdateStateInfo) {
        const bp = getBlueprintState(state);
        bp.nodeTemplate(info.nodeName, {
            type: "cloudify.nodes.Compute",
            properties: filterProperties(this.props, [ "ip", "install_agent"]),
        });
    }
}
