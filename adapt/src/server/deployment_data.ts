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
