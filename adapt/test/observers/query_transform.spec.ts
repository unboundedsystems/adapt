import {
    GraphQLSchema,
    print,
    DocumentNode
} from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as should from "should";
import { gql } from "../../src/observers";
import { applyAdaptTransforms } from "../../src/observers/query_transforms";

describe("Adapt GraphQL Query Transforms", () => {
    const schema = makeExecutableSchema({
        typeDefs: `
            type Foo {
                x: Int!
                foo: Foo
                bar(y: Int = 3): Bar
            }

            type Bar {
                y: Int!
                foo: Foo
                bar(y: Int!): Bar
            }

            type Query {
                foo: Foo
                bar: Bar
            }`
    });

    function transformPrintAndCheck(schema: GraphQLSchema, q: DocumentNode, ref: string) {
        const transformed = applyAdaptTransforms(schema, q);
        const tSerialized = print(transformed);
        should(tSerialized).equal(ref);
    }

    it("should transform top-level fields tagged with all (depth=1)", () => {
        const q = gql`{
            foo @all {
                baz
            }
        }`;

        const ref = `{
  foo @all {
    baz
    x
    foo
    bar
  }
}
`;

        transformPrintAndCheck(schema, q, ref);
    });

    it("should transform inner fields tagged with all (depth=1)", () => {
        const q = gql`{ foo { foo @all } }`
        const ref = `{
  foo {
    foo @all {
      x
      foo
      bar
    }
  }
}
`;

        transformPrintAndCheck(schema, q, ref);
    });

    it("should ignore fields that require parameters for all (depth=1)", () => {
        const q = gql`{ foo { bar @all } }`
        const ref = `{
  foo {
    bar @all {
      y
      foo
    }
  }
}
`;

        transformPrintAndCheck(schema, q, ref);
    });
});
