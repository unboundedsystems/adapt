import { registerObject } from "../../src/reanimate";
import { Living } from "./test_living";

class InFuncInternal extends Living {}

// The variable "module" can't be exported directly. Only a local variable
// can be exported.
const thisModule = module;
export {
    thisModule as module,
    InFuncInternal as InFunc,
};

export function doRegister(mod?: NodeModule | number) {
    registerObject(InFuncInternal, "InFuncReg", mod);
}
