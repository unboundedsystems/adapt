export function isLocal(filename: string) {
    return (filename.startsWith(".") || filename.startsWith("/"));
}
