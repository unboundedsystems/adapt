import Adapt, {
    findElementsInDom,
    handle,
    PrimitiveComponent,
    rule,
    Sequence,
    Style,
    useImperativeMethods,
    useInstanceValue,
    useMethod,
} from "@adpt/core";
import should from "should";
import { LocalContainer } from "../../src";
import { DockerImage, DockerImageInstance, ImageInfo, LocalDockerImage, LocalDockerImageProps } from "../../src/docker";
import { doBuild } from "../testlib";

class MockDockerImage extends PrimitiveComponent<LocalDockerImageProps>
    implements DockerImageInstance {

    image = {
        id: "imageid",
        nameTag: "imagetag"
    };
    latestImage() {
        return {
            id: "latestid",
            nameTag: "latesttag"
        };
    }
}

function MockService() {
    const img = handle();
    const latest = useMethod<ImageInfo | undefined>(img, undefined, "latestImage");
    const image = useInstanceValue<ImageInfo | undefined>(img, undefined, "image");

    useImperativeMethods(() => ({ image, latest }));

    return (
        <Sequence>
            <DockerImage handle={img} />
            {latest && latest.nameTag ?
                <LocalContainer name="myservice" image={latest.nameTag} dockerHost="" /> : null
            }
        </Sequence>
    );
}

const mockImageStyle =
    <Style>
        {DockerImage} {rule(() => <MockDockerImage />)}
        {LocalDockerImage} {rule(() => <MockDockerImage />)}
    </Style>;

const findLocalContainers =
    <Style>
        {LocalContainer} {rule()}
    </Style>;

describe("DockerImage", () => {
    it("Should replace with non-abstract image", async () => {
        const h = handle();
        const orig = <MockService handle={h} />;

        const { dom } = await doBuild(orig, { style: mockImageStyle });
        const els = findElementsInDom(findLocalContainers, dom);
        should(els).have.length(1);
        should(els[0].props.image).equal("latesttag");
        const inst = h.mountedOrig && h.mountedOrig.instance;
        if (!inst) throw should(inst).be.ok();
        should(inst.image).eql({ id: "imageid", nameTag: "imagetag" });
        should(inst.latest).eql({ id: "latestid", nameTag: "latesttag" });
    });
});
