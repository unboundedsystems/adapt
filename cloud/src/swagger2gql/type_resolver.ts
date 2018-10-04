interface PendingType<Type> {
    res: (ty: Type) => void;
    rej: (e: Error) => void;
}

export class TypeResolver<Type> {
    resolvedTypes = new Map<string, Type>();
    pendingTypes = new Map<string, PendingType<Type>>();

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
        if (ty !== undefined) return ty;
        const pending = this.pendingTypes.get(tyName);
        const pres = pending ? pending.res : noop;
        const prej = pending ? pending.rej : noop;
        return new Promise<Type>((res, rej) => {
            const newPending = {
                res: (t: Type) => { pres(t); res(t); },
                rej: (e: Error) => { prej(e); rej(e); }
            };
            this.pendingTypes.set(tyName, newPending);
        });
    }

    rejectPending = () => {
        this.pendingTypes.forEach((p, n) => p.rej(new Error(`Unable to resolve type '${n}'`)));
        this.pendingTypes.clear();
    }
}
