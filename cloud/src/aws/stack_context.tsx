import {
    createContext,
    Handle,
} from "@usys/adapt";

// tslint:disable-next-line: variable-name
export const CFStackContext = createContext<Handle | undefined>(undefined);
