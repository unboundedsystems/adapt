#!/usr/bin/env node

function usage(err) {
    err = err || "";
    console.error(`${err}\nUSAGE: ${process.argv[0]} <K8S IP>`);
}

function readInput() {
    let input = "";
    return new Promise((res, rej) => {
        process.stdin.on("data", (buf) => input += buf.toString());
        process.stdin.on("end", () => res(input));
        process.stdin.on("error", rej);
        process.stdin.resume();
    });
}

async function main(ip) {
    const json = await readInput();
    const obj = JSON.parse(json);
    const ports = [];
    obj.items.forEach((svc) => {
        if (svc.spec.type !== "LoadBalancer") return;
        svc.spec.ports.forEach((p) => ports.push(p.port));
    });
    console.log(`\nServices`);
    if (ports.length) {
        console.log(ports.map((p) => `http://${ip}:${p}/`).join("\n"));
    } else {
        console.log("<none>");
    }
}

// argv[0] is the node executable
// argv[1] is this script
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.log(args);
    usage(`Wrong number of arguments`);
    process.exit(1);
}

main(args[0]);
