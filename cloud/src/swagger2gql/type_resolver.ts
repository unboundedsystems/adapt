import { EventEmitter } from "events";
import { isError } from "lodash";

interface PendingType<Type> {
    res: (ty: Type) => void;
    rej: (e: Error) => void;
}

export class TypeResolver<Type> extends EventEmitter {
    resolvedTypes = new Map<string, Type | Error>();
    pendingTypes = new Map<string, PendingType<Type>>();

    addListener: (event: "needType", l: (resolver: this, name: string) => void) => this = super.addListener;
    emit: (event: "needType", resolver: this, name: string) => boolean = super.emit;

    addType = (tyName: string, ty: Type) => {
        if (this.resolvedTypes.has(tyName)) throw new Error(`Attempt to add duplicate type '{$tyName}'`);
        this.resolvedTypes.set(tyName, ty);
        const pending = this.pendingTypes.get(tyName);
        if (pending === undefined) return;
        this.pendingTypes.delete(tyName);
        pending.res(ty);
    }

    getType = async (tyName: string): Promise<Type> => {
        function noop() { return; }

        const ty = this.resolvedTypes.get(tyName);
        if (ty !== undefined) {
            if (isError(ty)) throw ty;
            return ty;
        }

        const pending = this.pendingTypes.get(tyName);
        const firstTime = pending === undefined;
        const pres = pending ? pending.res : noop;
        const prej = pending ? pending.rej : noop;
        return new Promise<Type>((res, rej) => {
            const newPending = {
                res: (t: Type) => { pres(t); res(t); },
                rej: (e: Error) => { prej(e); rej(e); }
            };
            this.pendingTypes.set(tyName, newPending);
            if (firstTime) {
                this.emit("needType", this, tyName);
            }
        });
    }

    rejectPending = () => {
        this.pendingTypes.forEach((p, n) => p.rej(new Error(`Unable to resolve type '${n}'`)));
        this.pendingTypes.clear();
    }

    resolveError = (tyName: string, e: Error) => {
        const pending = this.pendingTypes.get(tyName);
        if (pending === undefined) throw new Error(`Cannot have a resolve error for not-pending type: ${tyName}`);
        this.resolvedTypes.set(tyName, e);
        this.pendingTypes.delete(tyName);
        pending.rej(e);
    }
}
