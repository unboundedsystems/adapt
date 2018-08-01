export async function sleep(timeoutInMs: number): Promise<void> {
    return new Promise<void>((res) => {
        setTimeout(() => res(), timeoutInMs);
    });
}
