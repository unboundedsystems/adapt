import ld from "lodash";
import { CustomError } from "ts-custom-error";
import { MessageLogger, MessageStreamer } from "./message/index";

export interface TaskDefinitions {
    [ name: string ]: string;  // value is task description
}

export type TaskObserversKnown<Names extends string> = {
    [N in Names]: TaskObserver;
};

export interface TaskObserversUnknown {
    [ name: string ]: TaskObserver | undefined;
}

export type TaskObservers<Names extends string> =
    TaskObserversKnown<Names> & TaskObserversUnknown;

export interface TaskGroup {
    add<T extends TaskDefinitions>(tasks: T): TaskObservers<Extract<keyof T, string>>;
    task(name: string): TaskObserver;
}

export enum TaskState {
    Created = "Created",
    Started = "Started",
    Complete = "Complete",
    Skipped = "Skipped",
    Failed = "Failed",
}

export interface TaskObserver {
    readonly name: string;
    readonly description: string;
    readonly logger: MessageLogger;
    readonly options: TaskObserverOptions;
    readonly state: TaskState;

    updateStatus(txt: string): void;
    childGroup(serial?: boolean): TaskGroup;
    started(): void;
    skipped(): void;
    complete(): void;
    complete<T>(p: Promise<T> | (() => T | Promise<T>)): Promise<T>;
    failed(err: string | Error): void;
}

export interface TaskObserverOptions {
    description?: string;
    logger?: MessageLogger;
}

export function createTaskObserver(name: string, options: TaskObserverOptions = {}): TaskObserver {
    return new TaskObserverImpl(name, options);
}

class TaskObserverImpl implements TaskObserver {
    readonly description: string;
    readonly logger: MessageLogger;
    readonly options: Required<TaskObserverOptions>;
    private state_ = TaskState.Created;
    private childGroup_?: TaskGroupImpl;

    constructor(readonly name: string, options: TaskObserverOptions) {
        let { logger } = options;
        if (logger === undefined) logger = new MessageStreamer(name, {});

        this.logger = logger;
        this.options = {
            ...options,
            logger: options.logger || new MessageStreamer(name),
            description: options.description || name,
        };
    }

    get state() {
        return this.state_;
    }

    updateStatus(txt: string): void {
        console.log(`Task ${this.name} [status]: ${txt}`);
    }

    childGroup(serial = true): TaskGroup {
        if (!this.childGroup_) {
            this.childGroup_ = new TaskGroupImpl(serial, this.options);
        }
        return this.childGroup_;
    }

    started(): void {
        this.updateState(TaskState.Started);
    }

    skipped(): void {
        this.updateState(TaskState.Skipped);
    }

    complete(): void;
    complete<T>(p: Promise<T> | (() => T | Promise<T>)): Promise<T>;
    complete<T>(p?: Promise<T> | (() => T | Promise<T>)): Promise<T> | void {
        const done = (val?: T) => {
            this.updateState(TaskState.Complete);
            return val as T;
        };
        const fail = (err: any) => {
            this.failed(err);
            throw err;
        };

        if (ld.isFunction(p)) {
            this.started();
            return (async () => p())()
                .then(done)
                .catch(fail);
        }
        if (p !== undefined) {
            return p
                .then(done)
                .catch(fail);
        }
        done();
    }

    failed(err: string | Error): void {
        const msg = ld.isError(err) ? err.message : err.toString();
        console.log(`Task ${this.name} [error]: ${msg}`);
        this.updateState(TaskState.Failed);
    }

    private checkTransition(current: TaskState, next: TaskState): void {
        if (next === current) {
            throw new TaskObserverStateError(this, current, next);
        }
        let errored = false;
        switch (current) {
            case TaskState.Complete:
            case TaskState.Failed:
            case TaskState.Skipped:
                // These are final states. No transition permitted.
                errored = true;
                break;
            case TaskState.Started:
                errored =
                    ((next === TaskState.Created) ||
                     (next === TaskState.Skipped));
                break;
            case TaskState.Created:
                // Must go to Started before Complete
                if (next === TaskState.Complete) errored = true;
                break;
            default:
                return badState(this, current);
        }
        if (errored) throw new TaskObserverStateError(this, current, next);
    }

    private updateState(state: TaskState): void {
        switch (state) {
            case TaskState.Created:
            case TaskState.Started:
            case TaskState.Complete:
            case TaskState.Failed:
            case TaskState.Skipped:
                break;
            default:
                return badState(this, state);
        }

        this.checkTransition(this.state_, state);

        console.log(`Task ${this.name} [${state}]`);
        this.state_ = state;
    }
}

export class TaskObserverError extends CustomError {
    constructor(task: TaskObserver, msg: string) {
        super(`TaskObserver [${task.name}]: ${msg}`);
    }
}

export class TaskObserverStateError extends TaskObserverError {
    constructor(task: TaskObserver, current: TaskState, next: TaskState) {
        super(task, `invalid state transition (${current} -> ${next})`);
    }
}

function badState(task: TaskObserver, x: never): never {
    throw new TaskObserverError(task, `Invalid state ${x}`);
}

class TaskGroupImpl implements TaskGroup {
    private tasks_: TaskObserversUnknown = Object.create(null);

    constructor(readonly serial: boolean, readonly taskOptions: TaskObserverOptions) { }

    add<T extends TaskDefinitions>(tasks: T): TaskObservers<Extract<keyof T, string>> {
        // Pre-flight checks
        for (const name of Object.keys(tasks)) {
            if (this.tasks_[name]) {
                throw new Error(`A task with name ${name} already exists`);
            }
        }

        for (const name of Object.keys(tasks)) {
            const task = new TaskObserverImpl(name, {
                ...this.taskOptions,
                description: tasks[name],
            });
            this.tasks_[name] = task;
        }
        return this.tasks_ as TaskObservers<Extract<keyof T, string>>;
    }

    task(name: string): TaskObserver {
        const obs = this.tasks_[name];
        if (!obs) throw new Error(`Task name ${name} not found`);
        return obs;
    }
}
