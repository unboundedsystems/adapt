import {
    DocumentNode,
    GraphQLSchema,
    print
} from "graphql";
import { makeExecutableSchema } from "graphql-tools";
import * as should from "should";
import { gql } from "../../src/observers";
import { applyAdaptTransforms } from "../../src/observers/query_transforms";

describe("Adapt GraphQL Query Transforms (@all)", () => {
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
                barNull(y: Int): Bar
            }

            type Query {
                foo: Foo
            }

            type Mutation {
                bar: Bar
            }`
    });

    function transformPrintAndCheck(s: GraphQLSchema, q: DocumentNode, ref: string) {
        const transformed = applyAdaptTransforms(s, q);
        const tSerialized = print(transformed);
        should(tSerialized).equal(ref);
    }

    it("should transform top-level fields tagged with @all (depth=1)", () => {
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

    it("should transform field that requires args, but args are provided", () => {
      const q = gql`{
          foo {
            bar {
              bar(y: 10) @all(depth: 2)
            }
          }
      }`;

      const ref = `{
  foo {
    bar {
      bar(y: 10) @all(depth: 2) {
        y
        foo {
          x
          foo
          bar
        }
        barNull {
          y
          foo
          barNull
        }
      }
    }
  }
}
`;
      transformPrintAndCheck(schema, q, ref);
    });

    it("should transform operation tagged with @all (depth=1)", () => {
        const q = gql`query @all {
            dummy #For syntax compliance :(
        }`;

        const ref = `query @all {
  dummy
  foo
}
`;

        transformPrintAndCheck(schema, q, ref);
    });

    it("should transform top-level fields tagged with @all (depth=3)", () => {
        const q = gql`{
            foo @all(depth: 3) {
                baz
            }
        }`;

        const ref = `{
  foo @all(depth: 3) {
    baz
    x
    foo {
      x
      foo {
        x
        foo
        bar
      }
      bar {
        y
        foo
        barNull
      }
    }
    bar {
      y
      foo {
        x
        foo
        bar
      }
      barNull {
        y
        foo
        barNull
      }
    }
  }
}
`;

        transformPrintAndCheck(schema, q, ref);
    });

    it("should transform nested fields tagged with @all", () => {
        const q = gql`{
            foo @all(depth: 3) {
                baz
                bar @all(depth: 3)
            }
        }`;

        const ref = `{
  foo @all(depth: 3) {
    baz
    bar @all(depth: 3) {
      y
      foo {
        x
        foo {
          x
          foo
          bar
        }
        bar {
          y
          foo
          barNull
        }
      }
      barNull {
        y
        foo {
          x
          foo
          bar
        }
        barNull {
          y
          foo
          barNull
        }
      }
    }
    x
    foo {
      x
      foo {
        x
        foo
        bar
      }
      bar {
        y
        foo
        barNull
      }
    }
  }
}
`;

        transformPrintAndCheck(schema, q, ref);
    });

    it("should transform inner fields tagged with @all (depth=1)", () => {
        const q = gql`{ foo { foo @all } }`;
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

    it("should skip fields taggd with @all that require parameters (depth=1)", () => {
        const q = gql`{ foo { bar @all } }`;
        const ref = `{
  foo {
    bar @all {
      y
      foo
      barNull
    }
  }
}
`;

        transformPrintAndCheck(schema, q, ref);
    });

    it("should pick correct top-level type based on operation type", () => {
        const q = gql`mutation { bar @all }`;
        const ref = `mutation {
  bar @all {
    y
    foo
    barNull
  }
}
`;

        transformPrintAndCheck(schema, q, ref);
    });
});
