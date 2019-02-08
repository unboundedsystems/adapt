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

export async function waitForNoThrow(
    iterations: number,
    pollSec: number,
    action: () => Promise<void>): Promise<void> {

    let lastError: any | undefined;

    for (let i = 0; i < iterations; i++) {
        try {
            await action();
            return;
        } catch (e) {
            lastError = e;
        }
        await sleep(pollSec * 1000);
    }
    throw lastError;
}
