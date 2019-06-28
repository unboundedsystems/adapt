import ld from "lodash";
import { isElement } from "../jsx";

export const publicElementFields = {
    props: null,
    componentType: null
};

export function deepFilterElemsToPublic(o: any): any {
    if (!ld.isObject(o)) return o;

    if (ld.isArray(o)) {
        return o.map((item) => deepFilterElemsToPublic(item));
    }

    if (isElement(o)) {
        const filtered = ld.pickBy(o, (value: any, key: string) => {
            return key in publicElementFields;
        });

        if (filtered.props != null) {
            // Don't include props.handle
            const { handle, ...fProps } = filtered.props;
            (filtered as any).props = deepFilterElemsToPublic(fProps);
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
