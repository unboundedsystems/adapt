import { useState } from "./state";

export function useAsync<T>(f: () => Promise<T> | T, initial: T): T {
    const [val, setVal] = useState(initial);
    setVal(f);
    return val;
}
