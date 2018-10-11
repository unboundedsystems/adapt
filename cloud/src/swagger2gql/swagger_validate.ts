import { Validator } from "jsonschema";
import { Swagger2 } from "./swagger_types";

import jsonSchemaSchema = require("./json-schema-4.json");
import swagger2schema = require("./swagger2schema.json");

export function validateSwagger2(cand: unknown): Swagger2 {
    const validator = new Validator();
    validator.addSchema(jsonSchemaSchema, "http://json-schema.org/draft-04/schema");
    const result = validator.validate(cand, swagger2schema);
    if (result.errors.length > 0) {
        throw new Error("Invalid swagger specification: " + result.errors.join("\n"));
    }
    return result.instance as Swagger2;
}
