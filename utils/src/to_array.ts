export type ToArray<T> = T extends any[] ? T : T[];

export const toArray = <T>(val: T): ToArray<T> =>
    Array.isArray(val) ? val as any : [ val ];
