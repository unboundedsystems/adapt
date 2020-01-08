#!/usr/bin/env node
/*
 * Copyright 2018-2020 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const defaults = require("../dist/src/local-registry-defaults");
const registry = require("../dist/src/local-registry");
const utils = require("@adpt/utils");

const program = require("commander");
const crypto = require("crypto");
const execa = require("execa");
const fs = require("fs-extra");
const graceful = require('node-graceful').default;
const path = require("path");
const { format } = require("util");


/*
 * Common code between parent and child
 */

const logLevels =[ "fatal", "error", "warn", "http", "info", "debug", "trace" ];

program
    .command("start")
    .description("Start a local registry")
    .option("--empty", "Don't load any packages into the registry")
    .option("--loglevel <level>", `One of [${logLevels.join(", ")}]`, "warn")
    .option("--port <port>", "Port number to listen on", "auto")
    .action(cliHandler(doStart));

program
    .command("stop <registry>")
    .description("Stop a registry using port number or URL")
    .action(cliHandler(doStop));

program.on("command:*", () => {
    console.error(`\nInvalid command: ${program.args.join(' ')}\n`);
    program.help(); // Exits
});

function cliHandler(func) {
    return (...args) => {
        try {
            func(...args)
                .catch((err) => error(err));
        } catch (err) {
            error(err);
        }
    };
}

// Only the child process has process.send
const isChild = !!process.send;

let sendToParent = isChild;

function error(arg, ...args) {
    const errString = format(arg, ...args);
    if (isChild) {
        log(`Exiting on error: ${errString}`);
        if (sendToParent) process.send({ error: errString });
    } else {
        console.error(`ERROR(run-local-registry): ${errString}`);
    }

    process.exit(1);
}

function pidFile(port) {
    return `/tmp/local-registry-${port}.pid`;
}

function pad(num, len = 2) {
    return num.toString().padStart(len, "0");
}

async function doStart(cmd) {
    let port;

    if (cmd.port !== "auto") {
        port = Number(cmd.port);
        if (isNaN(port)) {
            return error(`Specified port '${cmd.port}' is not a number`);
        }
    }

    if (isChild) {
        const publishList = cmd.empty ? [] : defaults.defaultPublishList;
        await childStart(port, publishList);
    }
    else await parentStart();
}

/*
 * Child (server) process
 */

async function childStart(portIn, publishList) {
    process.on("disconnect", () => sendToParent = false);
    try {
        log(`Starting local registry`);
        const { port, server } = await start(portIn, publishList);
        const pfile = pidFile(port);
        await fs.writeFile(pfile, process.pid.toString());

        graceful.on("exit", async (_done, signame) => {
            log(`Terminating on ${signame}`);
            await server.stop();
            await fs.remove(pfile);
        });

        const url = `http://127.0.0.1:${port}`;

        // Process is now serving the local registry
        log(`Started local registry on ${url}`);
        process.send({ url });
        process.title = `run-local-registry [port ${port}]`;

    } catch (err) {
        error("Unable to start local registry", err);
        process.exit(1);
    }
}

function log(...args) {
    const d = new Date();
    const dateStrings = [ d.getMonth() + 1, d.getDate(), d.getHours(),
        d.getMinutes(), d.getSeconds() ].map(n => pad(n));
    const ts = format("[%d-%s-%s %s:%s:%s]", d.getFullYear(), ...dateStrings);
    console.log(ts, ...args);
}

function newPort() {
    let max = 10;
    while (--max >= 0) {
        const port = crypto.randomBytes(2).readUInt16BE(0);
        if (port > 1024) return port;
    }
    throw new Error(`Unable to select local registry port`);
}

/**
 * @return {registry.Config}
 */
function registryConfig(port, publishList, storage) {
    const listen = `0.0.0.0:${port}`;

    async function onStart() {
        return defaults.setupLocalRegistry(publishList, {
            registry: `http://${listen}`,
        });
    }

    return {
        ...defaults.config,
        listen,
        onStart,
        logs: [
            { type: "stdout", format: "pretty-timestamped", level: program.logLevel }
        ],
        storage,
    };
}

async function start(portIn, publishList) {
    const storage = await utils.mkdtmp("adapt-local-registry");
    let max = 10;
    while (--max >= 0) {
        try {
            const port = portIn || newPort();

            const server = await registry.start(registryConfig(port, publishList, storage), defaults.configPath);
            return { port, server };

        } catch (err) {
            if (!(err && err.code === "EADDRINUSE")) throw err;
            if (portIn) {
                error(`Port ${portIn} is already in use`);
            }
        }
    }
    throw new Error(`Unable to start local registry server: port conflicts`);
}

/*
 * Parent process
 */

async function parentStart() {
    const reg = process.env.ADAPT_TEST_REGISTRY;
    if (reg) {
        console.log(reg);
        return;
    }

    const log = await openLogfile();
    const child = execa.node(__filename, process.argv.slice(2), {
        stdout: log,
        stderr: log,
        detached: true,
    });
    child.on("message", msg => handleMessage(msg));
    child.on("error", e => handleError(e));
    child.on("close", (code, sig) => handleExit("close", code, sig));
    child.on("exit", (code, sig) => handleExit("exit", code, sig));
}

function handleMessage(msg) {
    const fail = () => error(`Message from child of type '${typeof msg}' not understood:`, msg);
    if (typeof msg !== "object") fail();

    if (msg.url) {
        console.log(msg.url);
        process.exit(0);
        return;
    }
    if (msg.error) {
        error(`Failed to create local registry: ${msg.error}`);
    }
    fail();
}

function handleError(err) {
    error(`Error in message channel with child:`, err);
}

function handleExit(event, code, sig) {
    error(`Unexpected ${event} event from child (code: ${code} signal: ${sig})`);
}

function logfile() {
    const d = new Date();
    const dateStrings = [ d.getMonth() + 1, d.getDate(), d.getHours(),
        d.getMinutes(), d.getSeconds() ].map(n => pad(n));
    const filename = format("local-registry-%d%s%s-%s%s%s.%s.log",
        d.getFullYear(), ...dateStrings, pad(d.getMilliseconds(), 3));
    const dirpath = path.join(utils.repoRootDir, "build", "logs");
    const filepath = path.join(dirpath, filename);
    return { dirpath, filepath };
}

async function openLogfile() {
    const { dirpath, filepath } = logfile();
    await fs.ensureDir(dirpath);
    return new Promise((resolve) => {
        const stream = fs.createWriteStream(filepath);
        stream.on("open", () => resolve(stream));
    });
}

async function doStop(arg) {
    const m = arg.match(/^http.*:(\d+)$/);
    const port = m ? Number(m[1]) : Number(arg);
    if (isNaN(port)) {
        return error(`Argument must be a port number or registry URL`);
    }

    let pidBuf;
    try {
        pidBuf = await fs.readFile(pidFile(port));
    } catch (err) {
        return error(`No pidfile found for port ${port}`);
    }
    const pid = Number(pidBuf.toString());
    if (isNaN(pid)) return error(`Invalid pidfile found: '${pidBuf}'`);

    try {
        process.kill(pid);
    } catch (err) {
        if (err.errno === "ESRCH") return error(`Process is not running`);
        throw err;
    }
}

function main() {
    if (process.argv.length <= 2) {
        program.help(); // Exits
    }

    program.parse(process.argv);
}

main();
