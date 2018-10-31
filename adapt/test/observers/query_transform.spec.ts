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
                bar: Bar
            }

            type Bar {
                y: Int!
                foo: Foo
                bar: Bar
            }

            type Query {
                foo: Foo
                bar: Bar
            }`,

        resolvers: {
            Query: {
                foo: () => {
                    return {
                        x: 0,
                        foo: {
                            x: 1,
                            foo: {
                                x: 2,
                                foo: {
                                    x: 3,
                                    foo: {
                                        x: 4
                                    }
                                }
                            }
                        }
                    };
                },

                bar: () => {
                    return {
                        y: 0,
                        bar: {
                            y: 1,
                            bar: {
                                y: 2,
                                bar: {
                                    y: 3,
                                    bar: {
                                        y: 4,
                                        bar: {
                                            y: 5
                                        }
                                    }
                                }
                            }
                        }
                    };
                }
            }
        }
    });

    it("should transform top-level fields tagged with all (depth=1)", () => {
        const q = gql`{
            foo @all {
                baz
            }
        }`;

        const ref = 
`{
  foo @all {
    baz
    x
    foo
    bar
  }
}
`

        const serialized = print(q);
        should(serialized).match(/@all/);

        const transformed = applyAdaptTransforms(schema, q);
        const tSerialized = print(transformed);
        should(tSerialized).equal(ref);
    });
});
