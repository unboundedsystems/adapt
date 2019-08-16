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
import * as ld from "lodash";
import { buildGraphQLSchema, ResolverFactory } from "./converter";
import { validateSwagger2 } from "./swagger_validate";

const debug = db("adapt:cloud:swagger2gql");

function swagger2gql(swaggerIn: string | object, getResolver?: ResolverFactory) {
    debug("swagger2gql start");
    const swaggerObj = ld.isString(swaggerIn) ? JSON.parse(swaggerIn.toString()) : swaggerIn;
    const swagger = validateSwagger2(swaggerObj);
    const ret = buildGraphQLSchema(swagger, getResolver);
    debug("swagger2gql done");
    return ret;
}

export { ResolverFactory };
export {
    Swagger2
} from "./swagger_types";

export default swagger2gql;
