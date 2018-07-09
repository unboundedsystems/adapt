import {
    filterProperties,
    PrimitiveComponent,
    UpdateStateInfo
} from "@usys/adapt";

import { ContainerProps } from "../Container";

import { getBlueprintState } from "./Blueprint";

export type CloudifyContainerProps = ContainerProps;

export class CloudifyContainer
    extends PrimitiveComponent<CloudifyContainerProps, {}> {

    updateState(state: any, info: UpdateStateInfo) {
        const createParams: any =
            filterProperties(this.props,
                           ["ports", "tty", "command", "environment"]);
        createParams.stdin_open = this.props.stdinOpen;

        const bp = getBlueprintState(state);
        bp.nodeTemplate(info.nodeName, {
            type: "cloudify.docker.Container",
            properties: filterProperties(this.props, [ "name", "image"]),
            interfaces: {
                "cloudify.interfaces.lifecycle": {
                    create: {
                        implementation: "docker.docker_plugin.tasks.create_container",
                        inputs: { params: createParams }
                    },

                    start: {
                        implementation: "docker.docker_plugin.tasks.start",
                        inputs: {
                            params: {
                                port_bindings: this.props.portBindings,
                                links: this.props.links,
                            },
                            processes_to_wait_for: [],
                            retry_interval: 1
                        }
                    }
                }
            },
            relationships: [
                {
                    type: "cloudify.relationships.contained_in",
                    target: "somenode",
                }
            ],
        });
    }
}
