import { PropertiesOfTypeT, TaggedT } from "type-ops";

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
 * Return the keys from T where ALL of the types in union AllOf
 * can be assigned to the associated property type T[K].
 *
 * Example:
 *   interface Foo {
 *    one: string | number;
 *    two: number;
 *    three: string;
 *    four: object;
 *   }
 *   KeysAssignableToAll<Foo, string | number> === "one"
 */
export type KeysAssignableToAll<T, AllOf> = {
    [K in keyof T]: [AllOf] extends [T[K]] ? K : never
}[keyof T];

/**
 * Return the keys from T where ANY one of the types in union AnyOf
 * can be assigned to the associated property type T[K].
 *
 * Example:
 *   interface Foo {
 *    one: string | number;
 *    two: number;
 *    three: string;
 *    four: object;
 *   }
 *   KeysAssignableToAny<Foo, string | number> === "one" | "two" | "three"
 */
export type KeysAssignableToAny<T, AnyOf> = {
    [K in keyof T]: [T[K]] extends [AnyOf] ? K : never
}[keyof T];

// An opaque type that isn't assignable to any other types except itself and "any"
type UniqueType = TaggedT<string, "UniqueType">;

export type PropertiesOfTypeAny<T extends object> =
    PropertiesOfTypeT<Required<T>, UniqueType>;

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
    T extends { [Name in Key]: infer Ret } ? Ret :
    T extends { [Name in Key]?: infer Ret } ? Ret : never;

/**
 * A constructor function that takes any arguments and returns the
 * specified instance type.
 */
export type Constructor<T extends object> = (new (...args: any[]) => T);

export type Literal = string | number | boolean | undefined | null | void | {};

/**
 * A function to create a tuple, which simultaneously creates both the
 * static type and a runtime array object.
 * @param args The elements of the tuple. The type of each element determines
 * the type of each tuple element and, in the case of literals, will be
 * narrowed to the literal unless there is a type assertion on the literal.
 *
 * Example:
 *   const a = tuple("one", 2, true, "3" as string, true as boolean);
 *   // a => ["one", 2, true, "3", true];
 *   // typeof a => ["one", 2, true, string, boolean]
 */
export const tuple = <T extends Literal[]>(...args: T) => args;

/**
 * Given a tuple, returns a union of all the tuple element types.
 */
export type TupleToUnion<T extends Literal[]> = T[number];

export type FIXME_NeedsProperType = unknown;
