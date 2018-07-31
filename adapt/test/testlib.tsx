import { findPackageDirs } from "@usys/utils";
import { Console } from "console";
import * as ld from "lodash";
import * as should from "should";
import { WritableStreamBuffer } from "stream-buffers";
import * as Adapt from "../src";
import * as jsx from "../src/jsx";
import { Logger } from "../src/type_support";

export const packageDirs = findPackageDirs(__dirname);
export const pkgRootDir = packageDirs.root;
export const pkgTestDir = packageDirs.test;

export function checkChildComponents(element: Adapt.AdaptElement, ...children: any[]) {
    const childArray = jsx.childrenToArray(element.props.children);

    const childComponents = childArray.map(
        (child: any) => {
            if (Adapt.isElement(child)) {
                return child.componentType;
            } else {
                return undefined;
            }
        }
    );

    should(childComponents).eql(children);
}

export class Empty extends Adapt.PrimitiveComponent<{ id: number }> { }

export function MakeMakeEmpty(props: { id: number }) {
    return <MakeEmpty id={props.id} />;
}

export function MakeEmpty(props: { id: number }) {
    return <Empty id={props.id} />;
}

export function MakeGroup(props: { children?: Adapt.AdaptElement[] | Adapt.AdaptElement }) {
    return <Adapt.Group>{props.children}</Adapt.Group>;
}

export interface WithDefaultsProps {
    prop1?: number;
    prop2?: number;
}
export class WithDefaults extends Adapt.Component<WithDefaultsProps> {
    static defaultProps = {
        prop1: 100,
        prop2: 200,
    };

    build() {
        return (
            <Adapt.Group>
                <Empty key="1" id={this.props.prop1!} />
                <Empty key="2" id={this.props.prop2!} />
            </Adapt.Group>
        );
    }
}

export const publicElementFields = {
    props: null,
    componentType: null
};

export function deepFilterElemsToPublic(o: any): any {
    if (!ld.isObject(o)) return o;

    if (ld.isArray(o)) {
        return o.map((item) => deepFilterElemsToPublic(item));
    }

    if (Adapt.isElement(o)) {
        const filtered = ld.pickBy(o, (value: any, key: string) => {
            return key in publicElementFields;
        });

        if (filtered.props != null) {
            (filtered as any).props = deepFilterElemsToPublic(filtered.props);
        }
        return filtered;
    }

    const ret: { [key: string]: any } = {};
    // tslint:disable-next-line:forin
    for (const key in o) {
        ret[key] = deepFilterElemsToPublic(o[key]);
    }
    return ret;
}

export interface MockLogger {
    stdout: string;
    stderr: string;
    log: Logger;
    error: Logger;
}

class MockLoggerImpl implements MockLogger {
    _stdout = new WritableStreamBuffer();
    _stderr = new WritableStreamBuffer();
    log: Logger;
    error: Logger;

    constructor() {
        const c = new Console(this._stdout, this._stderr);
        this.log = c.log;
        this.error = c.error;
    }
    get stdout() {
        return this._stdout.getContentsAsString();
    }
    get stderr() {
        return this._stderr.getContentsAsString();
    }
}

export function createMockLogger(): MockLogger {
    return new MockLoggerImpl();
}
