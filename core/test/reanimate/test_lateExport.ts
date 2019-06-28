import { registerObject } from "../../src/reanimate";
import { Living } from "./test_living";

class LateExportInternal extends Living {}

registerObject(LateExportInternal, "LateExportReg", module);

// The variable "module" can't be exported directly. Only a local variable
// can be exported.
const thisModule = module;
export {
    thisModule as module,
};

// Ensure the registered object gets added to exports AFTER the call to
// registerObject. That's what we're testing.
// Creating a new variable seems to keep TypeScript from hoisting the
// export earlier in the transpiled JS.
// tslint:disable-next-line:variable-name
export const LateExport = LateExportInternal;
