export function grep(s: string, pat: RegExp | string): string[] {
    if (!pat) throw new Error(`Invalid pattern`);

    return s.split("\n").filter((l) => {
        return (typeof pat === "string") ?
            l.includes(pat) : pat.test(l);
    });
}
