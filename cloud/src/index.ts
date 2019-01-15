export * from "./Compute";
export * from "./Container";
export * from "./DockerHost";
export * from "./LocalCompute";
export * from "./LocalContainer";
export * from "./LocalDockerHost";
export * from "./LocalTypescriptBuild";
export * from "./NetworkService";
export * from "./ready";
export * from "./Sequence";

import * as ansible from "./ansible";
import * as aws from "./aws";
import * as cloudify from "./cloudify";
import * as k8s from "./k8s";
export {
    ansible,
    aws,
    cloudify,
    k8s,
};
