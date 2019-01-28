import ld from "lodash";
import { CustomError } from "ts-custom-error";
import {
    MessageLogger,
    MessageStreamer,
    MessageType,
    TaskState,
    TaskStatus,
} from "./message/index";
import { immediatePromise } from "./sleep";

const debugTaskTime = false;

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

export interface TaskGroupOptions {
    serial?: boolean;
}

const defaultTaskGroupOptions = {
    serial: true,
};

export interface TaskObserver {
    readonly name: string;
    readonly description: string;
    readonly logger: MessageLogger;
    readonly options: TaskObserverOptions;
    readonly state: TaskState;

    updateStatus(txt: string): void;
    childGroup(options?: TaskGroupOptions): TaskGroup;
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
    startTime?: number;
    private state_ = TaskState.Created;
    private childGroup_?: TaskGroupImpl;

    constructor(readonly name: string, options: TaskObserverOptions) {
        let { logger, description } = options;
        if (logger == null) logger = new MessageStreamer(name);
        if (description == null) description = name;

        this.logger = logger;
        this.description = description;
        this.options = {
            logger,
            description,
        };
        this.log(this.state_, this.description);
    }

    get state() {
        return this.state_;
    }

    updateStatus(txt: string): void {
        this.log(TaskStatus.Status, txt);
    }

    childGroup(options: TaskGroupOptions = {}): TaskGroup {
        if (!this.childGroup_) {
            const tgOpts = { ...defaultTaskGroupOptions, ...options };
            this.childGroup_ = new TaskGroupImpl(tgOpts, this.options);
            this.log(TaskStatus.ChildGroup, JSON.stringify(tgOpts));
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
            // Allow events to fire
            return immediatePromise()
                .then(() => val as T);
        };
        const fail = (err: any) => {
            this.failed(err);
            throw err;
        };

        if (ld.isFunction(p)) {
            this.started();
            return immediatePromise()
                .then(p)
                .then(done)
                .catch(fail);
        }
        if (p !== undefined) {
            return p
                .then(done)
                .catch(fail);
        }
        this.updateState(TaskState.Complete);
    }

    failed(err: string | Error): void {
        const msg = ld.isError(err) ? err.message : err.toString();
        this.updateState(TaskState.Failed, msg);
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
                if (next === TaskState.Created) errored = true;
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

    private log(event: TaskState | TaskStatus, txt?: string) {
        let msg = `[${event}]`;
        if (txt !== undefined) msg += `: ${txt}`;
        this.logger.log(MessageType.task, msg);
    }

    private updateState(state: TaskState, msg?: string): void {
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

        if (debugTaskTime) {
            if (state === TaskState.Started) this.startTime = Date.now();
            if (state === TaskState.Complete && this.startTime) {
                msg = `${Date.now() - this.startTime}ms`;
            }
        }

        this.state_ = state;
        this.log(state, msg);
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

    constructor(
        readonly options: Required<TaskGroupOptions>,
        readonly taskOptions: TaskObserverOptions) { }

    add<T extends TaskDefinitions>(tasks: T): TaskObservers<Extract<keyof T, string>> {
        // Pre-flight checks
        for (const name of Object.keys(tasks)) {
            if (this.tasks_[name]) {
                throw new Error(`A task with name ${name} already exists`);
            }
        }

        const parentLogger = this.taskOptions.logger;

        for (const name of Object.keys(tasks)) {
            const logger = parentLogger && parentLogger.createChild(name);
            const task = new TaskObserverImpl(name, {
                ...this.taskOptions,
                logger,
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
