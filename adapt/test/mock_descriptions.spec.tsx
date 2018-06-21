// This file has some mock workflows that use this library to test
// interactions between features

import * as unbs from "../src";

// tslint:disable-next-line:no-duplicate-imports
import {
    build,
    PrimitiveComponent
} from "../src";

class Serverless extends PrimitiveComponent<{}> { }
class Func extends PrimitiveComponent<{ image: string }> { }

const store: any = {};

function DockerImage(_props: any) { return null; }

function NpmFunc(props: { name: string, registry: string, store: any }) {
    if (props.store && props.store.image && props.store.image.length !== 0) {
        return <Func image={props.store.image} />;
    } else {
        return <DockerImage npm={`${props.registry}/${props.name}`} >
        </DockerImage>;
    }
}

describe("Simple Serverless on K8S", () => {
    it("Single Function", () => {
        const dom =
            <Serverless>
                <NpmFunc name="foo" registry="http://www.npmjs.org" store={store} >
                </NpmFunc>
            </Serverless>;

        build(dom, null);
    });
});

describe("Simple Serverless on AWS Lambda", () => {
    it("Single Function");
});
