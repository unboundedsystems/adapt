import * as jsx from './jsx';
import * as tySup from './type_support';

function mount<Props>(ctor: string |
    jsx.FunctionComponentTyp<Props> |
    jsx.ClassComponentTyp<Props>,
    props: tySup.ExcludeInterface<Props, tySup.Children<any>>,
    ...children: tySup.ChildType<Props>[]): jsx.Component<any> {

    if (typeof ctor === "string") {
        switch (ctor) {
            case "group":
                if (jsx.childrenAreNodes(ctor, children)) {
                    return new jsx.Group({ children: children });
                } else {
                    throw new TypeError("Children of group must be UNodes")
                }
            default:
                throw new Error("Unknown primitive element " + ctor);
        }
    } else {
        //If props === null we got no props.  
        //createElement(ctor, null) will be generated in .js when Props is {}.
        //createElement(ctor, null) should never typecheck for 
        //explicit calls from .ts, use createElement(ctor, {}) instead.
        const coercedProps = (props === null ? {} : props) as Props;
        return tySup.asConsOrFunc(ctor)(coercedProps);
    }
}