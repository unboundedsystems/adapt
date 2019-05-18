import { DependsOnMethod } from "../deploy";
import { useImperativeMethods } from "./imperative";

export function useDependsOn(f: DependsOnMethod) {
    useImperativeMethods(() => ({
        dependsOn: f,
    }));
}
