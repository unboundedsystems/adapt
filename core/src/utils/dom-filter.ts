/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
