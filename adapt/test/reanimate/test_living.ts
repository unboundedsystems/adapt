// Base class for deriving test objects
export class Living {}

export function isLiving(val: any): val is Living {
    return val instanceof Living;
}
