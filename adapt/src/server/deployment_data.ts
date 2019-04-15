/**
 * Types describing the actual stored data in an AdaptServer
 */
import { DeployStatus } from "../deploy";

/**
 * Top level of info that's stored in the Server
 */
export interface DeploymentStored {
    deployID: string;
    currentSequence: DeploymentSequence | null;
    sequenceInfo: SequenceInfoMap;
    stateDirs: string[];
}

export type DeploymentSequence = number; // Integer only

export interface ElementStatus {
    deployStatus: DeployStatus;
    error?: string;
}

export interface ElementStatusMap {
    [ elementID: string ]: ElementStatus;
}

export interface SequenceInfo {
    deployStatus: DeployStatus;
    goalStatus: DeployStatus;
    elementStatus: ElementStatusMap;
}

export interface SequenceInfoMap {
    [ deploymentSequence: number ]: SequenceInfo;
}
