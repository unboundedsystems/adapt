import { createHash } from "crypto";

export function sha256hex(data: Buffer | string): string {
    const sha = createHash("sha256");
    sha.update(data);
    return sha.digest("hex");
}
