import { registerObject } from "../../src/reanimate";
import { Living } from "./test_living";

class VictimInternal extends Living {}

// The variable "module" can't be exported directly. Only a local variable
// can be exported.
const thisModule = module;

// Ensure export happens before registerObject
export {
    VictimInternal as Victim,
    thisModule as module,
};

registerObject(VictimInternal, "VictimReg", module);
