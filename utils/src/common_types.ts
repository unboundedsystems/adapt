/**
 * Return an object type that doesn't have keys in ToRemove
 */
export type Omit<T, ToRemove> = Pick<T, Exclude<keyof T, ToRemove>>;

/**
 * Alias for the more standard name Omit
 */
export type ExcludeKeys<T, ToRemove> = Omit<T, ToRemove>;

/**
 * Return an object type where if a key appears in the ToRemove object type,
 * it's removed from the returned object type.
 */
export type ExcludeInterface<T, ToRemove> =
    ExcludeKeys<T, keyof ToRemove>;

/**
 * A function with a common type of args and a specified return type
 */
export type FuncType<Args, Ret> = (...args: Args[]) => Ret;

/**
 * A class with a constructor with a common type of args and a specified
 * instance type
 */
export type ClassType<Args, Ret> = new (...args: Args[]) => Ret;

/**
 * Returns the type of the property Key from object type T
 */
export type ExtractType<T, Key extends keyof T> =
    T extends { [Name in Key]: infer Ret } ? Ret : never;

/**
 * A constructor function that takes any arguments and returns the
 * specified instance type.
 */
export type Constructor<T extends object> = (new (...args: any[]) => T);
