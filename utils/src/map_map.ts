export function mapMap<K, V, T>(map: Map<K, V>, f: (key: K, val: V) => T): T[] {
    const ret: T[] = [];
    for (const [k, v] of map.entries()) {
        ret.push(f(k, v));
    }
    return ret;
}
