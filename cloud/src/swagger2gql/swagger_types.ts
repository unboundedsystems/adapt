import { tuple } from "@usys/utils";

export interface Swagger2Contact {
    name?: string;
    url?: string;
    email?: string;
}

export interface Swagger2License {
    name: string;
    url?: string;
}

export interface Swagger2Info {
    title: string;
    description?: string;
    termsOfService?: string;
    contact?: Swagger2Contact;
    license?: Swagger2License;
    version: string;
}

type Swagger2Schemes = "http" | "https" | "ws" | "wss";

export interface Swagger2Operation {
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: Swagger2ExternalDocumentation;
    operationId?: string;
    consumes?: string[]; //Must be value in Mime Types, expand strings here
    produces?: string[]; //See MimeTypes comment above
    parameters?: (Swagger2Parameter | Swagger2Ref)[];
    responses: unknown;
    schemes?: Swagger2Schemes;
    deprecated?: boolean;
    security: unknown;
}

export interface Swagger2ExternalDocumentation {
    description?: string;
    url: string;
}

type Swagger2Parameter = Swagger2ParameterOther | Swagger2ParameterBody;

export interface Swagger2ParameterCommon {
    name: string;
    in: string;
    description?: string;
    required?: boolean;
}

export interface Swagger2ParameterBody extends Swagger2ParameterCommon {
    in: "body";
    schema: unknown;
}

type Swagger2Items = Swagger2ItemsOther | Swagger2ItemsArray;

export interface Swagger2ItemsCommon extends Swagger2JSONValueRanges {
    collectionFormat?: "csv" | "ssv" | "tsv" | "pipes";
}

type Swagger2ItemsOther = Swagger2ItemsString | Swagger2ItemsNumberOrInteger | Swagger2ItemsBoolean;

export interface Swagger2ItemsNonArrayCommon extends Swagger2ItemsCommon {
    items?: Swagger2Items;
}

export interface Swagger2ItemsString extends Swagger2ItemsNonArrayCommon {
    type: "string";
    default?: string;
}

export interface Swagger2ItemsNumberOrInteger {
    type: "number" | "integer";
    default?: number;
}

export interface Swagger2ItemsBoolean {
    type: "boolean";
    default?: boolean;
}

export interface Swagger2ItemsArray extends Swagger2ItemsCommon {
    type: "array";
    items: Swagger2Items;
}

export interface Swagger2JSONValueRanges {
    maximum?: number;
    exclusiveMaximum?: boolean;
    minimum?: number;
    exclusiveMinimum?: boolean;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    enum?: unknown[];
    multipleOf?: number;
}

export interface Swagger2ParameterOtherCommon extends Swagger2JSONValueRanges {
    format?: string;
    allowEmptyValue?: boolean;
}

type Swagger2ParameterOther =
    Swagger2ParameterStringOrFile
    | Swagger2ParameterNumberOrInteger
    | Swagger2ParameterBoolean
    | Swagger2ParameterArray;

export interface Swagger2ParameterNonArray extends Swagger2ParameterOtherCommon {
    in: "query" | "header" | "path" | "formData";
    items?: Swagger2Items;
}

export interface Swagger2ParameterStringOrFile extends Swagger2ParameterNonArray {
    type: "string" | "file";
    default: string;
}

export interface Swagger2ParameterNumberOrInteger extends Swagger2ParameterNonArray {
    type: "number" | "integer";
    default: number;
}

export interface Swagger2ParameterBoolean extends Swagger2ParameterNonArray {
    type: "boolean";
    default: boolean;
}

type Swagger2ParameterCollectionFormatsNoMulti = "csv" | "ssv" | "tsv" | "pipes";
type Swagger2ParameterCollectionFormats = Swagger2ParameterCollectionFormatsNoMulti | "multi";

type Swagger2ParameterArray = Swagger2ParameterArrayOther | Swagger2ParameterArrayMulti;

export interface Swagger2ParameterArrayCommon extends Swagger2ParameterOtherCommon {
    type: "array";
    items: Swagger2Items;
    default?: unknown[];
}

export interface Swagger2ParameterArrayOther extends Swagger2ParameterArrayCommon {
    in: "header" | "path";
    collectionFormat?: Swagger2ParameterCollectionFormatsNoMulti;
}

export interface Swagger2ParameterArrayMulti extends Swagger2ParameterArrayCommon {
    in: "query" | "formData";
    collectionFormat?: Swagger2ParameterCollectionFormats;
}

export interface Swagger2Ref {

}

export interface Swagger2PathItem {
    ["$ref"]: string;
    get: Swagger2Operation;
    put: Swagger2Operation;
    post: Swagger2Operation;
    delete: Swagger2Operation;
    options: Swagger2Operation;
    head: Swagger2Operation;
    patch: Swagger2Operation;
    parameters: Swagger2Parameter | Swagger2Ref;
}

export interface Swagger2 {
    swagger: "2.0";
    info: Swagger2Info;
    basePath?: string;
    paths: { [path: string]: Swagger2PathItem; };
    schemes?: Swagger2Schemes;
}

export const swagger2Operations = tuple(
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch"
);
