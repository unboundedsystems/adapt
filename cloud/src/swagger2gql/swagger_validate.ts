import jsonStableStringify = require("json-stable-stringify");
import { Validator } from "jsonschema";
import { Swagger2 } from "./swagger_types";

import { createHash } from "crypto";
import jsonSchemaSchema = require("./json-schema-4.json");
import swagger2schema = require("./swagger2schema.json");

let validator: Validator;
const validMap = new Map<string, boolean>();

function validMapKey(cand: unknown): string {
    const json = jsonStableStringify(cand);
    return createHash("md5").update(json, "utf8").digest().toString();
}

function isValidated(cand: unknown): boolean {
    const key = validMapKey(cand);
    return validMap.get(key) || false;
}

function validated(cand: unknown): void {
    const key = validMapKey(cand);
    validMap.set(key, true);
}

export function validateSwagger2(cand: unknown): Swagger2 {
    if (!validator) {
        validator = new Validator();
        validator.addSchema(jsonSchemaSchema, "http://json-schema.org/draft-04/schema");
    }
    if (isValidated(cand)) return cand as Swagger2;
    const result = validator.validate(cand, swagger2schema);
    if (result.errors.length > 0) {
        throw new Error("Invalid swagger specification: " + result.errors.join("\n"));
    }
    validated(cand);
    return result.instance as Swagger2;
}
