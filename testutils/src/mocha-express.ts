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
import { InternalError } from "@adpt/utils";
import express, { Express } from "express";
import http from "http";
import { Done } from "mocha";

export { Request, Response } from "express";

type FixtureFunc = (callback: (done: Done) => PromiseLike<any> | void) => void;

export interface MochaExpressOptions {
}

export interface ExpressFixture {
    app: Express;
    url: string;
}

class ExpressFixtureImpl implements ExpressFixture {
    app_?: Express;
    server_?: http.Server;
    url_?: string;

    constructor(public options: MochaExpressOptions = {}) { }

    get app() {
        if (!this.app_) throw new Error(`Must call start before accessing app`);
        return this.app_;
    }

    get server() {
        if (!this.server_) throw new Error(`Must call start before accessing server`);
        return this.server_;
    }

    get url() {
        if (!this.url_) throw new Error(`Must call start before accessing url`);
        return this.url_;
    }

    async start() {
        const app = express();
        this.app_ = app;
        this.server_ = http.createServer(app);
        await new Promise((res, rej) => this.server.listen((err: Error) => err ? rej(err) : res()));
        const addr = this.server.address();
        if (typeof addr === "string") throw new InternalError(`Expected an object`);
        this.url_ = `http://localhost:${addr.port}`;
    }

    async stop() {
        const server = this.server_;
        if (!server) return;
        this.server_ = undefined;
        await new Promise((res, rej) => server.close((err: Error) => err ? rej(err) : res()));
    }
}

function setup(beforeFn: FixtureFunc, afterFn: FixtureFunc,
               fixture: ExpressFixtureImpl) {

    beforeFn(async function startExpress(this: any) {
        this.timeout(20 * 1000);
        await fixture.start();
    });

    afterFn(async function stopExpress(this: any) {
        this.timeout(20 * 1000);
        await fixture.stop();
    });
}

export function all(options: MochaExpressOptions = {}): ExpressFixture {
    const fixture = new ExpressFixtureImpl(options);
    setup(before, after, fixture);
    return fixture;
}

export function each(options: MochaExpressOptions = {}): ExpressFixture {
    const fixture = new ExpressFixtureImpl(options);
    setup(beforeEach, afterEach, fixture);
    return fixture;
}
