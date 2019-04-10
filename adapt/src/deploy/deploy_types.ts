// Unique ID for an element. Currently AdaptElement.id.
export type ElementID = string;

export enum DeployStatus {
    Initial = "Initial",
    Deploying = "Deploying",
    Deployed = "Deployed",
    //Retrying = "Retrying",
    Failed = "Failed",
    //Destroying = "Destroying",
    //Destroyed = "Destroyed",
}
