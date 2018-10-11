export class TypeResolver<Type> {
    resolvedTypes = new Map<string, Type>();

    constructor(public resolveType: (tyName: string) => Type) { }

    addType = (tyName: string, ty: Type) => {
        if (this.resolvedTypes.has(tyName)) throw new Error(`Attempt to add duplicate type '{$tyName}'`);
        this.resolvedTypes.set(tyName, ty);
    }

    getType = (tyName: string): Type => {
        const ty = this.resolvedTypes.get(tyName);
        if (ty !== undefined) return ty;

        const newTy = this.resolveType(tyName);
        this.addType(tyName, newTy);
        return newTy;
    }
}
