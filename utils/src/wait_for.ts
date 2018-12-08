import { sleep } from "./sleep";

export async function waitFor(
    iterations: number,
    pollSec: number,
    timeoutMsg: string,
    action: () => Promise<boolean>): Promise<void> {

    for (let i = 0; i < iterations; i++) {
        if (await action()) return;
        await sleep(pollSec * 1000);
    }
    throw new Error(timeoutMsg);
}
