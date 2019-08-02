import { Handle } from "../handle";
import { useImperativeMethods } from "./imperative";
import { callInstanceMethod } from "./use_method";

export function useMethodFrom(hand: Handle, methodName: string, defaultVal?: any,
    ...args: any[]) {
    useImperativeMethods(() => ({
        [methodName]: () => callInstanceMethod(hand, defaultVal, methodName, ...args)
    }));
}
