import {
    createContext,
    Handle,
} from "@adpt/core";

// tslint:disable-next-line: variable-name
export const CFStackContext = createContext<Handle | undefined>(undefined);
