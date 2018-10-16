import * as ld from "lodash";
import { buildGraphQLSchema, ResolverFactory } from "./converter";
import { validateSwagger2 } from "./swagger_validate";

function swagger2gql(swaggerIn: string | object, getResolver?: ResolverFactory) {
    const swaggerObj = ld.isString(swaggerIn) ? JSON.parse(swaggerIn.toString()) : swaggerIn;
    const swagger = validateSwagger2(swaggerObj);
    return buildGraphQLSchema(swagger, getResolver);
}

export default swagger2gql;
