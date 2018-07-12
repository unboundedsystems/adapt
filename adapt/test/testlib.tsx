import { spawnSync } from "child_process";
import * as path from "path";
import * as should from "should";
import * as Adapt from "../src";

export const pkgRootDir =
    path.resolve(path.join(__dirname, "..", ".."));
export const pkgTestDir = path.join(pkgRootDir, "test");

export interface NpmOptions {
    dir?: string;
    packages?: string[];
}
export function npmInstall(options?: NpmOptions) {
    const cwd = (options && options.dir) || process.cwd();
    let args = ["install"];
    if (options && options.packages) args = args.concat(options.packages);

    spawnSync("npm", args, { cwd, stdio: "inherit" });
}

export function checkChildComponents(element: Adapt.UnbsElement, ...children: any[]) {
    should(element.props.children).not.Null();
    should(element.props.children).be.Array();

    const childComponents = element.props.children.map(
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

export class Empty extends Adapt.PrimitiveComponent<{ id: number }, {}> { }

export function MakeMakeEmpty(props: { id: number }) {
    return <MakeEmpty id={props.id} />;
}

export function MakeEmpty(props: { id: number }) {
    return <Empty id={props.id} />;
}

export function MakeGroup(props: { children?: Adapt.UnbsElement[] | Adapt.UnbsElement }) {
    return <Adapt.Group>{props.children}</Adapt.Group>;
}

export interface WithDefaultsProps {
    prop1?: number;
    prop2?: number;
}
export class WithDefaults extends Adapt.Component<WithDefaultsProps, {}> {
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
