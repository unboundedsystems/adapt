import { registerConstructor } from "../../src/reanimate";

// Base class that registers itself
export class BaseReg {
    constructor() {
        registerConstructor(this.constructor);
    }
}

function doRegister(ctor: any) {
    registerConstructor(ctor);
}

export class BaseRegFunc {
    constructor() {
        doRegister(this.constructor);
    }
}

export class BaseRegNested {
    constructor() {
        new BaseReg();
    }
}

export class Derived extends BaseReg {}

// The variable "module" can't be exported directly. Only a local variable
// can be exported.
const thisModule = module;
export {
    thisModule as module,
};
