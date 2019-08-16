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

import db from "debug";
import jsonStableStringify = require("json-stable-stringify");
import { Validator } from "jsonschema";
import { Swagger2 } from "./swagger_types";

import { createHash } from "crypto";
import jsonSchemaSchema = require("./json-schema-4.json");
import swagger2schema = require("./swagger2schema.json");

const debug = db("adapt:cloud:swagger2gql");

const knownSwaggerSpecs = [
    "3f9280af09efeaf35940feb34b7449de", // AwsCfObserver
    "7cf922b28a4f6562069fe68c716bb6d7", // AwsEc2Observer
    "1cf94afa6c91f4c71cb4c37182ecee6e", // DockerObserver
    "5eb0190ff7afd4ef33bc9dec64a8ed04", // K8sObserver
];

let validator: Validator;
const validSet = new Set<string>(knownSwaggerSpecs);

function validSetKey(cand: unknown): string {
    const json = jsonStableStringify(cand);
    return createHash("md5").update(json, "utf8").digest("hex");
}

function isValidated(cand: unknown): boolean {
    const key = validSetKey(cand);
    const found = validSet.has(key);
    if (!found) debug(`Swagger spec with hash ${key} has not been pre-validated`);
    return found;
}

function validated(cand: unknown): void {
    const key = validSetKey(cand);
    validSet.add(key);
}

export function validateSwagger2(cand: unknown): Swagger2 {
    if (isValidated(cand)) return cand as Swagger2;
    if (!validator) {
        validator = new Validator();
        validator.addSchema(jsonSchemaSchema, "http://json-schema.org/draft-04/schema");
    }
    const result = validator.validate(cand, swagger2schema);
    if (result.errors.length > 0) {
        throw new Error("Invalid swagger specification: " + result.errors.join("\n"));
    }
    validated(cand);
    return result.instance as Swagger2;
}
