export * from "./Compute";
export * from "./Container";
export * from "./DockerHost";
export * from "./LocalCompute";
export * from "./LocalContainer";
export * from "./LocalDockerHost";

import * as aws from "./aws";
import * as cloudify from "./cloudify";
import * as k8s from "./k8s";
export {
    aws,
    cloudify,
    k8s,
};
