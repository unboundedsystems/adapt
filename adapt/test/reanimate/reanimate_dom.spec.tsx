import should from "should";
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
import { componentConstructorDataFixture } from "../testlib";

export class Flex extends PrimitiveComponent<AnyProps> { }

describe("Reanimate DOM basic tests", () => {
    componentConstructorDataFixture();

    async function roundTrip(origDom: AdaptElement, eql = true) {
        const xmlString = serializeDom(origDom, { reanimateable: true });
        const newDom = await reanimateDom(xmlString);

        if (eql) should(newDom).eql(origDom);
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
        const origDom =
            <Adapt.Group key="a">
                <Flex id={1} key="a"/>
                <Flex id={2} key="b"/>
            </Adapt.Group>;
        await roundTrip(origDom);
    });

    it("Should reanimate DOM with non-Element children", async () => {
        const someObj = { a: { b: ["c"] } };
        const origDom =
            <Adapt.Group key="a">
                <Flex id={1} key="a">{someObj}{someObj}</Flex>
                <Flex id={2} key="b"/>
            </Adapt.Group>;
        await roundTrip(origDom);
    });

    it("Should reanimate DOM with complex props", async () => {
        const origDom = <Flex id={1} key="a" obj={{ x: 3, y: { z: [4, 5] } }} />;
        await roundTrip(origDom);
    });

    it("Should build a reanimated simple DOM", async () => {
        const origDom =
            <Adapt.Group key="Group">
                <Flex id={1} key="a"/>
                <Flex id={2} key="b"/>
            </Adapt.Group>;
        const zombie = await roundTrip(origDom);
        if (zombie == null) {
            should(zombie).not.be.Null();
            return;
        }

        const { messages, contents: built } = await buildOnce(zombie, null);
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

        const builtZombie = await roundTrip(built, false);
        if (zombie == null) throw should(zombie).not.Null();
        if (!isMountedElement(builtZombie)) throw should(isMountedElement(builtZombie)).True();
        return should(builtZombie.status()).rejectedWith(/not supported yet/);
    });

});
