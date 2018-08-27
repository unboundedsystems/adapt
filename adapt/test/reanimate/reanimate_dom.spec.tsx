import * as should from "should";
import Adapt, {
    AdaptElement,
    AnyProps,
    buildOnce,
    PrimitiveComponent,
    serializeDom
} from "../../src";
import { AdaptPrimitiveElementImpl, isMountedElement } from "../../src/jsx";
import { findMummy, reanimate } from "../../src/reanimate";
import { reanimateDom } from "../../src/reanimate/reanimate_dom";

export class Flex extends PrimitiveComponent<AnyProps> { }

describe("Reanimate DOM basic tests", () => {
    async function roundTrip(origDom: AdaptElement) {
        const xmlString = serializeDom(origDom, true);
        const newDom = await reanimateDom(xmlString);

        should(newDom).eql(origDom);
        return newDom;
    }

    it("Should register component on construction", async () => {
        new Flex({});
        const mummyJson = findMummy(Flex);
        should(mummyJson).be.type("string");
        const obj = await reanimate(mummyJson);
        should(obj).equal(Flex);
    });

    it("Should reanimate a simple DOM", async () => {
        const origDom = <Adapt.Group><Flex id={1} /><Flex id={2} /></Adapt.Group>;
        await roundTrip(origDom);
    });

    it("Should reanimate DOM with non-Element children", async () => {
        const someObj = { a: { b: "c" } };
        const origDom =
            <Adapt.Group>
                <Flex id={1}>{someObj}{someObj}</Flex>
                <Flex id={2} />
            </Adapt.Group>;
        await roundTrip(origDom);
    });

    it("Should build a reanimated simple DOM", async () => {
        const origDom = <Adapt.Group><Flex id={1} /><Flex id={2} /></Adapt.Group>;
        const zombie = await roundTrip(origDom);
        if (zombie == null) {
            should(zombie).not.be.Null();
            return;
        }

        const { messages, contents: built } = buildOnce(zombie, null);
        should(messages).have.length(0);
        if (built == null) {
            should(built).not.be.Null();
            return;
        }
        if (! (built instanceof AdaptPrimitiveElementImpl)) {
            should(built instanceof AdaptPrimitiveElementImpl).be.True();
            return;
        }
        should(isMountedElement(built)).be.True();
        should(built.props.key).equal("Group");
    });

});
