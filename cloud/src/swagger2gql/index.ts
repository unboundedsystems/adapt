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
