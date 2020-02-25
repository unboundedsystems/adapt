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

import { CustomError } from "ts-custom-error";
import {
    TBoolean,
    TDuration,
    TNumber,
    TString,
} from "./types";

// tslint:disable-next-line: no-var-requires
const parseDuration = require("parse-duration");

export class InvalidValue extends CustomError { }

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
            if (duration === 0) throw new InvalidValue();
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

/**
 * The structure for how we parse and validate a type.
 */
export interface ValTypeInfoEntry<In = any, Out = In> {
    inputType: In;
    outputType: Out;
    validator: (val: any) => Out;
}

/**
 * Defines the types we know how to parse and validate.
 */
export const valTypeInfo = {
    boolean: {
        inputType: TBoolean,
        outputType: TBoolean,
        validator: validateBoolean,
    },

    duration: {
        inputType: TDuration,
        outputType: TNumber,
        validator: validateDuration,
    },

    string: {
        inputType: TString,
        outputType: TString,
        validator: validateString,
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
