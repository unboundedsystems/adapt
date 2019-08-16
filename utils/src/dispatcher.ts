/*
 * Copyright 2019 Unbounded Systems, LLC
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
