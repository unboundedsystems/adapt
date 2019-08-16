/*
 * Copyright 2019 Unbounded Systems, LLC
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

/**
 * Types describing the actual stored data in an AdaptServer
 */
import { DeployOpStatus, DeployStatus } from "../deploy";

/**
 * Top level of info that's stored in the Server
 */
export interface DeploymentStored {
    deployID: string;
    currentOpID: DeployOpID | null;
    deployOpInfo: DeployOpInfoMap;
    stateDirs: string[];
}

export type DeployOpID = number; // Integer only
export interface DeployStepID {
    deployOpID: DeployOpID;
    deployStepNum: number;
}

export interface ElementStatus {
    deployStatus: DeployStatus;
    error?: string;
}

export interface ElementStatusMap {
    [ elementID: string ]: ElementStatus;
}

export interface DeployStepInfo {
    deployStatus: DeployOpStatus;
    goalStatus: DeployStatus;
    elementStatus: ElementStatusMap;
}

export interface DeployOpInfoMap {
    [ deployOpID: number ]: DeployStepInfoMap;
}

export interface DeployStepInfoMap {
    currentStepNum: number | null;
    [ deployStepNum: number ]: DeployStepInfo;
}
