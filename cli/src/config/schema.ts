/*
 * Copyright 2020 Unbounded Systems, LLC
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

import { InternalError } from "@adpt/utils";
import { CustomError } from "ts-custom-error";
import {
    TBoolean,
    TDuration,
    TNumber,
    TString,
} from "./types";

// tslint:disable-next-line: no-var-requires
const parseDuration = require("parse-duration");

class InvalidValue extends CustomError { }

export class SchemaValidationError extends CustomError {
    constructor(public prop: string, public expectedType: string, public actualType: string) {
        super(`Validation failed for property '${prop}'. Expected type '${expectedType}'.`);
    }
}

function validateBoolean(val: any): ValTypeOutput<"boolean"> {
    switch (typeof val) {
        case "boolean": return val;
        case "string":
            switch (val.toLowerCase()) {
                case "0":
                case "false":
                case "off":
                case "no":
                    return false;
                case "1":
                case "true":
                case "on":
                case "yes":
                    return true;
            }
    }
    throw new InvalidValue();
}

function validateDuration(val: any): ValTypeOutput<"duration"> {
    switch (typeof val) {
        case "string":
            const duration = parseDuration(val);
            if (duration === null) throw new InvalidValue();
            return duration;

        case "number":
            return val;

        default:
            throw new InvalidValue();
    }
}

function validateString(val: any): ValTypeOutput<"string"> {
    switch (typeof val) {
        case "string":
            return val;

        default:
            throw new InvalidValue();
    }
}

function storeInput<In = any, Out = In>(_vtEntry: ValTypeInfoEntry<In, Out, In>, orig: In): In {
    return orig;
}

function storeOutput<In = any, Out = In>(vtEntry: ValTypeInfoEntry<In, Out, Out>, orig: In): Out {
    return vtEntry.validator(orig);
}

/**
 * The structure for how we parse and validate a type.
 */
export interface ValTypeInfoEntry<In = any, Out = In, Store = Out> {
    /**
     * TypeScript types that are valid as input.
     */
    inputType: In;
    /**
     * Normalized type that results from parsing, transformation, and
     * validation.
     */
    outputType: Out;
    /**
     * Parses, normalizes, transforms, and validates input, returning the
     * correct output type. Throws InvalidType upon parse or validate error.
     */
    validator: (val: any) => Out;
    /**
     * Transforms the original input value into the preferred format for
     * storing this type. Storage type can be any type representable in JSON.
     */
    storeFormat: (vtEntry: ValTypeInfoEntry<In, Out, Store>, orig: In) => Store;
}

/**
 * Defines the types we know how to parse and validate.
 */
export const valTypeInfo = {
    boolean: {
        inputType: TBoolean,
        outputType: TBoolean,
        validator: validateBoolean,
        storeFormat: storeOutput,
    },

    duration: {
        inputType: TDuration,
        outputType: TNumber,
        validator: validateDuration,
        storeFormat: storeInput, // Save in whatever format was input
    },

    string: {
        inputType: TString,
        outputType: TString,
        validator: validateString,
        storeFormat: storeInput,
    },
};
export type ValTypeInfo = typeof valTypeInfo;

/**
 * Names of the types we know how to parse and validate.
 */
export type ValType = keyof ValTypeInfo;

export interface SchemaItem<T extends ValType = ValType> {
    asType: T;
    default?: ValTypeInput<T>;
}
export interface Schema {
    [ prop: string ]: SchemaItem;
}

export type SchemaInputType<S extends Schema> = {
    [ Prop in keyof S ]: ValTypeInput<S[Prop]["asType"]>;
};
export type SchemaOutputType<S extends Schema> = {
    [ Prop in keyof S ]: ValTypeOutput<S[Prop]["asType"]>;
};

export type ValTypeInput<VT extends ValType> = ValTypeInfo[VT]["inputType"];
export type ValTypeOutput<VT extends ValType> = ValTypeInfo[VT]["outputType"];

export function parseItem<S extends Schema, Prop extends keyof S>(
    prop: Prop, val: any, schema: S) {

    if (!(prop in schema)) throw new Error(`Property '${prop}' is not a valid property name`);
    const asType = schema[prop].asType;
    const vti = valTypeInfo[asType];
    if (!vti) throw new InternalError(`Unhandled type '${asType}' in config schema`);
    const { storeFormat, validator } = vti;

    try {
        const parsed = validator(val);
        const store = storeFormat(vti, val);
        return {
            parsed,
            store,
        };

    } catch (err) {
        if (err.name !== "InvalidValue") throw err;

        throw new SchemaValidationError(prop.toString(), asType, typeof val);
    }
}
