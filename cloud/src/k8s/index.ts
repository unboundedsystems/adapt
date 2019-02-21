export * from "./Container";
export * from "./Resource"; //This must be before Pod and Service, but why?
export * from "./Pod";
export * from "./Service";
export * from "./ServiceDeployment";
export * from "./common";

export {
    K8sPlugin,
    createK8sPlugin,
    resourceElementToName,
    registerResourceKind
} from "./k8s_plugin";
