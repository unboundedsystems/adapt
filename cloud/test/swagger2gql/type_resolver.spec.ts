import {
    GraphQLFloat,
    GraphQLInt,
    GraphQLString,
    GraphQLType
} from "graphql";
import * as should from "should";
import { TypeResolver } from "../../src/swagger2gql/type_resolver";

describe("TypeResolver Tests", () => {
    let res: TypeResolver<GraphQLType>;

    beforeEach(() => {
        res = new TypeResolver();
    });

    it("Should instantiate", async () => {
        should(res).not.Undefined();
        should(res).not.Null();
    });

    it("Should resolve added types", async () => {
        res.addType("string", GraphQLString);
        res.addType("integer", GraphQLInt);
        res.addType("number", GraphQLFloat);

        should(await res.getType("string")).eql(GraphQLString);
        should(await res.getType("integer")).eql(GraphQLInt);
        should(await res.getType("number")).eql(GraphQLFloat);
    });

    it("Should resolve pending types on add", async () => {
        const stringTyP = res.getType("string");
        should(stringTyP).Promise();

        res.addType("string", GraphQLString);
        should(await stringTyP).eql(GraphQLString);
        should(await res.getType("string")).eql(GraphQLString);
    });

    it("Should reject all pending types with error", async () => {
        const stringTyP = res.getType("string");
        const numberTyP = res.getType("number");
        should(stringTyP).Promise();
        should(numberTyP).Promise();

        res.addType("string", GraphQLString);
        should(await stringTyP).eql(GraphQLString);

        res.rejectPending();
        await should(numberTyP).rejectedWith(Error);

        should(await res.getType("string")).eql(GraphQLString);
    });

    it("Should reject pending types when resolution fails", async () => {
        const stringTyP = res.getType("string");
        const numberTyP = res.getType("number");
        should(stringTyP).Promise();
        should(numberTyP).Promise();

        res.resolveError("number", new Error("Whoops"));
        await should(numberTyP).rejectedWith("Whoops");
        await should(res.getType("number")).rejectedWith("Whoops");

        res.addType("string", GraphQLString);
        should(await res.getType("string")).eql(GraphQLString);
    });

});
