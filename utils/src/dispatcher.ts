export interface CanDispatch<Ty extends string = string> {
    type: Ty;
}

export type Handler<Type extends string, T extends CanDispatch<Type>, Ret> =
    (t: Extract<T, { type: Type }>) => Ret;

export type TypesFor<T extends CanDispatch> = T["type"];

export class Dispatcher<T extends CanDispatch, Ret> {
    protected handlers = new Map<TypesFor<T>, Handler<TypesFor<T>, T, Ret>>();

    constructor(readonly name?: string) {}

    add<Type extends TypesFor<T>>(type: Type, handler: Handler<Type, Extract<T, { type: Type }>, Ret>) {
        this.handlers.set(type, handler as any);
    }

    dispatch(toHandle: T) {
        const handler = this.handlers.get(toHandle.type);
        if (!handler) {
            throw new Error(`Unable to find handler for ` +
                `${this.name ? " " + this.name : ""} type '${toHandle.type}`);
        }
        return handler(toHandle as any);
    }
}
