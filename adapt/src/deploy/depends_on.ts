import {
    DoneWaiting,
    Waiting,
} from "./deploy_types";

export const waiting = (status: string): Waiting => ({ done: false, status });
export const doneWaiting = (): DoneWaiting => ({ done: true });
