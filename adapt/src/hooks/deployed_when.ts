import { DeployedWhenMethod } from "../deploy";
import { useImperativeMethods } from "./imperative";

export function useDeployedWhen(f: DeployedWhenMethod) {
    useImperativeMethods(() => ({
        deployedWhen: f,
    }));
}
