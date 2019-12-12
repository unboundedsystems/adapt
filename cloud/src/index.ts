/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

export * from "./Compute";
export * from "./ConnectTo";
export * from "./Container";
export * from "./DockerHost";
export * from "./LocalCompute";
export * from "./LocalContainer";
export * from "./LocalDockerHost";
export * from "./NetworkService";
export * from "./Service";

import * as action from "./action";
import * as aws from "./aws";
import {
    makeResourceName,
} from "./common";
import * as docker from "./docker";
import * as http from "./http";
import * as k8s from "./k8s";
import * as mongodb from "./mongodb";
import * as nginx from "./nginx";
import * as nodejs from "./nodejs";
import * as postgres from "./postgres";
import * as redis from "./redis";
export {
    action,
    aws,
    docker,
    http,
    k8s,
    makeResourceName,
    mongodb,
    nginx,
    nodejs,
    postgres,
    redis,
};
export * from "./handles";
export * from "./env";
