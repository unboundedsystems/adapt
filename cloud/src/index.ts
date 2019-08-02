export * from "./Compute";
export * from "./ConnectTo";
export * from "./Container";
export * from "./DockerHost";
export * from "./LocalCompute";
export * from "./LocalContainer";
export * from "./LocalDockerHost";
export * from "./NetworkService";
export * from "./Service";

import * as ansible from "./ansible";
import * as aws from "./aws";
import * as docker from "./docker";
import * as http from "./http";
import * as k8s from "./k8s";
import * as nginx from "./nginx";
import * as nodejs from "./nodejs";
import * as postgres from "./postgres";
export {
    ansible,
    aws,
    docker,
    http,
    k8s,
    nginx,
    nodejs,
    postgres
};
export * from "./handles";
