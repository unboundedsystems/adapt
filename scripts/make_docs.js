#!/usr/bin/env node

// This file is derived from:
// https://github.com/faastjs/faast.js/blob/82057347adb0a1144dcf5615373c5e80ae2b9535/build/make-docs.js
// Copyright 2019 Andy Chou
// Apache 2.0 license

const { readdir, createReadStream, ensureDir, writeFile, remove } = require("fs-extra");
const { createInterface } = require("readline");
const { join, parse } = require("path");
const execa = require("execa");

const projects = {
    core: {
        name: "Core",
    },
    cloud: {
        name: "Cloud",
    },
}

function usage(message) {
    console.log(`Error:`, message);
    console.log(`Usage: make_docs.js core|cloud`);
    return process.exit(1);
}

function parseArgs() {
    if (process.argv.length !== 3) {
        return usage(`wrong number of arguments`);
    }

    const project = process.argv[2];
    if (!(project in projects)) {
        return usage(`project must be one of: ${Object.keys(projects).join(", ")}`);
    }

    return {
        project,
    };
}

// This script is not part of faast.js, but rather a tool to rewrite some parts
// of the generated docs from api-generator and api-documenter so they work with
// the website generated by docusaurus.

async function main() {
    const args = parseArgs();
    const buildDir = join(".", "build");
    const tmpDir = join(buildDir, "tmp", "docs");
    const outDir = join(buildDir, "docs", "api", args.project);

    await remove(tmpDir);
    await remove(outDir);
    await ensureDir(tmpDir);
    await ensureDir(outDir);

    try {
        await execa("api-extractor", ["run", "--local"], { stdio: "inherit" });
    } catch (err) {
        console.error("Error: api-extractor failed");
        process.exit(1);
    }

    try {
        await execa("api-documenter", ["markdown", "-i", buildDir, "-o", tmpDir],
                { stdio: "inherit" });
    } catch (err) {
        console.error("Error: api-documenter failed");
        process.exit(1);
    }

    const docFiles = await readdir(tmpDir);
    for (const docFile of docFiles) {
        try {
            const { name: id, ext } = parse(docFile);
            if (ext !== ".md") {
                continue;
            }

            const inPath = join(tmpDir, docFile);
            const input = createReadStream(inPath);
            const output = [];
            const lines = createInterface({
                input,
                crlfDelay: Infinity
            });

            let title = "";
            lines.on("line", line => {
                if (!title) {
                    const titleLine = line.match(/## (.*)/);
                    if (titleLine) {
                        title = titleLine[1];
                    }
                }
                const homeLink = line.match(/\[Home\]\(.\/index\.md\) &gt; (.*)/);
                if (homeLink) {
                    line =
                        `[${projects[args.project].name} API Overview](overview) &gt; ` +
                        homeLink[1];
                }

                line = sanitizeLinks(line);
                output.push(line);
            });

            await new Promise(resolve => lines.once("close", resolve));
            input.close();

            const header = [
                "---",
                `id: ${id}`,
                `title: "${title}"`,
                `hide_title: true`,
                "---"
            ];

            const outPath = join(outDir, sanitizeFilename(docFile));
            await writeFile(outPath, header.concat(output).join("\n"));
        } catch (err) {
            console.error(`Could not process ${docFile}: ${err}`);
        }
    }
    await remove(tmpDir);
}

const ctorRegex = /\(\.([^(]*)\.\(constructor\)\.md\)/g;
function sanitizeLinks(line) {
    /*
     * Replace problematic parens in constructor links. Needs to match up
     * with sanitizeFilename's treatment of the linked files.
     *
     * NOTE(mark): The reason this is required is because the embedded parens
     * in the link trigger a bug in Docusaurus that leads to broken website
     * links. They try to use a regex to do general parsing for markdown links,
     * which doesn't correctly handle nested parens. Rather than repeat their
     * same mistake, this regex is very narrowly targeted at a specific, but
     * common pattern generated by API Documenter.
     */
    return line.replace(ctorRegex, "(.$1._constructor_.md)");
}

function sanitizeFilename(filename) {
    // See comment in sanitizeLinks
    return filename.replace(/\(constructor\)/g, "_constructor_");
}

main();
