import { isEqual, isObjectLike } from "lodash";

interface Workflows {
}

interface IBlueprintState {
    tosca_definitions_version: string;
    imports: string[];
    node_templates: NodeTemplates;
    node_types: NodeTypes;
    outputs: Nodes;
    workflows?: Workflows;
}

export class BlueprintState {
    private bpStateRoot: IBlueprintState;

    constructor(blueprintStateRoot: any) {
        this.bpStateRoot = blueprintStateRoot;
        if (isEqual(this.bpStateRoot, {})) this.init();
    }

    // One-time init of an empty blueprint state object
    init() {
        this.bpStateRoot.tosca_definitions_version = "cloudify_dsl_1_3";
        this.bpStateRoot.imports = [
            "http://www.getcloudify.org/spec/cloudify/4.0.1/types.yaml",
            // TODO: The plugin imports should be specified by the individual
            // modules, not hard coded here.
            "https://gitlab.com/mterrel/cloudify-docker-plugin/raw/u.master/plugin.yaml"
        ];
        this.bpStateRoot.node_templates = {};
        this.bpStateRoot.node_types = {};
        this.bpStateRoot.outputs = {};
    }

    nodeTemplate(nodeName: string, templ: NodeTemplate) {
        this.bpStateRoot.node_templates[nodeName] = templ;
    }
}

export function getBlueprintState(state: any): BlueprintState {
    if (!isObjectLike(state)) {
        throw new Error(`Unable to get blueprint from state of ${typeof state}`);
    }
    if (!state.cloudifyBlueprint) state.cloudifyBlueprint = {};
    return new BlueprintState(state.cloudifyBlueprint);
}

export interface Nodes {
    [name: string]: any;
}

// These should have stronger typing eventually
export type Properties =    Nodes;
export type Instances =     Nodes;
export type Capabilities =  Nodes;
export type Interfaces =    Nodes;

export interface NodeTemplate {
    type: string;
    properties?: Properties;
    instances?: Instances; // deprecated
    interfaces?: Interfaces;
    relationships?: Relationship[];
    capabilities?: Capabilities;
}
interface NodeTemplates {
    [name: string]: NodeTemplate;
}

interface NodeType {
    derived_from?: string;
    interfaces?: Interfaces;
    properties?: TypeProperties;
}
interface NodeTypes {
    [name: string]: NodeType;
}

interface TypeProperty {
    description?: string;
    type?: string;
    default?: string;
    required?: boolean;
}
interface TypeProperties {
    [name: string]: TypeProperty;
}

export interface Relationship {
    type: string;
    target: string;
    connection_type?: "all_to_all" | "all_to_one";
    source_interfaces?: Interfaces;
    target_interfaces?: Interfaces;
}
