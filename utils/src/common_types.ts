/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { PropertiesOfTypeT, TaggedT } from "type-ops";

/**
 * Return an object type that doesn't have keys in ToRemove
 * @public
 */
export type Omit<T, ToRemove> = Pick<T, Exclude<keyof T, ToRemove>>;

/**
 * Alias for the more standard name Omit
 * @public
 */
export type ExcludeKeys<T, ToRemove> = Omit<T, ToRemove>;

/**
 * Return an object type where if a key appears in the ToRemove object type,
 * it's removed from the returned object type.
 * @public
 */
export type ExcludeInterface<T, ToRemove> =
    ExcludeKeys<T, keyof ToRemove>;

/**
 * Return the keys from T where ALL of the types in union AllOf
 * can be assigned to the associated property type T[K].
 * @remarks
 *
 * Example:
 *   interface Foo {
 *    one: string | number;
 *    two: number;
 *    three: string;
 *    four: object;
 *   }
 *   KeysAssignableToAll<Foo, string | number> === "one"
 * @public
 */
export type KeysAssignableToAll<T, AllOf> = {
    [K in keyof T]: [AllOf] extends [T[K]] ? K : never
}[keyof T];

/**
 * Return the keys from T where ANY one of the types in union AnyOf
 * can be assigned to the associated property type T[K].
 * @remarks
 *
 * Example:
 *   interface Foo {
 *    one: string | number;
 *    two: number;
 *    three: string;
 *    four: object;
 *   }
 *   KeysAssignableToAny<Foo, string | number> === "one" | "two" | "three"
 * @public
 */
export type KeysAssignableToAny<T, AnyOf> = {
    [K in keyof T]: [T[K]] extends [AnyOf] ? K : never
}[keyof T];

/**
 * An opaque type that isn't assignable to any other types except itself and "any"
 * @public
 */
export type UniqueType = TaggedT<string, "UniqueType">;

/**
 * Extract only those properties of `T` that have type `any`.
 * @public
 */
export type PropertiesOfTypeAny<T extends object> =
    PropertiesOfTypeT<Required<T>, UniqueType>;

/**
 * Type for a function with a common type of args and a specified return type
 * @public
 */
export type FuncType<Args, Ret> = (...args: Args[]) => Ret;

/**
 * Type for a class with a constructor with a common type of args and a
 * specified instance type
 * @public
 */
export type ClassType<Args, Ret> = new (...args: Args[]) => Ret;

/**
 * Returns the type of the property `Key` from object type `T`
 * @public
 */
export type ExtractType<T, Key extends keyof T> =
    T extends { [Name in Key]: infer Ret } ? Ret :
    T extends { [Name in Key]?: infer Ret } ? Ret : never;

/**
 * Type of a constructor function that takes any arguments and returns the
 * specified instance type.
 * @public
 */
export type Constructor<Inst extends object> = (new (...args: any[]) => Inst);

/**
 * Types that are literals.
 * @public
 */
export type Literal = string | number | boolean | undefined | null | void | {};

/**
 * A function to create a tuple, which simultaneously creates both the
 * static type and a runtime array object.
 *
 * @remarks
 * @param args - The elements of the tuple. The type of each element determines
 * the type of each tuple element and, in the case of literals, will be
 * narrowed to the literal unless there is a type assertion on the literal.
 *
 * Example:
 *   const a = tuple("one", 2, true, "3" as string, true as boolean);
 *   // a => ["one", 2, true, "3", true];
 *   // typeof a => ["one", 2, true, string, boolean]
 * @public
 */
export const tuple = <T extends Literal[]>(...args: T) => args;

/**
 * Given a tuple, returns a union of all the tuple element types.
 * @public
 */
export type TupleToUnion<T extends Literal[]> = T[number];

export type FIXME_NeedsProperType = unknown;

/**
 * Type that could either be the input type or a `Promise` for that type.
 * @public
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Type for an object that can have any properties.
 * @public
 */
export interface AnyObject {
    [ key: string ]: any;
    [ key: number ]: any;
}
