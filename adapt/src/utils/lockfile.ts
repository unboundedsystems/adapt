import { inDebugger } from "@usys/utils";
import plf from "proper-lockfile";

export const lockDefaults = {
    retries: 2,
    // 1 day if in the debugger, otherwise 10 sec
    stale: inDebugger() ? 24 * 60 * 60 * 1000 : 10 * 1000,
};

export function lock(filename: string, options: plf.LockOptions = {}) {
    return plf.lock(filename, { ...lockDefaults, ...options });
}
