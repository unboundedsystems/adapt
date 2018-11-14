export function inDebugger() {
    return process.execArgv.find((arg) => /^(--debug|--inspect)/.test(arg)) !== undefined;
}
