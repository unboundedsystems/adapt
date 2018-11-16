import {
    GraphQLFloat,
    GraphQLInt,
    GraphQLString,
    GraphQLType
} from "graphql";
import should from "should";
import { TypeResolver } from "../../src/swagger2gql/type_resolver";

describe("TypeResolver Tests", () => {
    let res: TypeResolver<GraphQLType>;

    beforeEach(() => {
        res = new TypeResolver<GraphQLType>((tyName: string) => {
            if (tyName === "string") return GraphQLString;
            throw new Error(`Cannot resolve type '${tyName}'`);
        });
    });

    it("Should instantiate", async () => {
        should(res).not.Undefined();
        should(res).not.Null();
    });

    it("Should resolve added types", async () => {
        res.addType("string", GraphQLString);
        res.addType("integer", GraphQLInt);
        res.addType("number", GraphQLFloat);

        should(res.getType("string")).eql(GraphQLString);
        should(res.getType("integer")).eql(GraphQLInt);
        should(res.getType("number")).eql(GraphQLFloat);
    });

    it("Should resolve types on get", async () => {
        const stringTy = res.getType("string");

        should(stringTy).eql(GraphQLString);
        should(() => res.getType("number")).throw(Error);
    });
});
