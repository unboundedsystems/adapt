import should from 'should';

import * as util from 'util';
import * as cp from 'child_process';
import * as fs from 'fs';

import * as tmp from 'tmp-promise';
import * as sg from 'simple-git/promise';
import * as etcd3 from 'etcd3';

const configPath = "../config";

const exec = util.promisify(cp.exec);

interface ServerConfig {
    deployment: string;
    etcd_ep: string;
}

const readFile = util.promisify(fs.readFile);

//FIXME(manishv) config should become a JSON file, but post-receive.sh has to then parse it.  
//Perhaps entrypoint should be nodejs? :(
async function loadAdaptGitServerConfig(path: string): Promise<ServerConfig> {
    const file = await readFile(path, { encoding: "utf8" });
    const lines = file.split(/\r?\n/);
    let etcd_ep: string | undefined;
    let deployment: string | undefined;

    for (const line of lines) {
        const [key, value] = line.split(/\s*=\s*/);
        switch (key) {
            case "ADAPT_DEPLOYMENT":
                deployment = value;
                break;
            case "ADAPT_ETCD_EP":
                etcd_ep = value;
                break;
        }
    }

    if (deployment == null) throw new Error("No ADAPT_DEPLOYMENT in Adapt config");
    if (etcd_ep == null) throw new Error("No ADAPT_ETCD_EP in Adapt config");

    return { deployment, etcd_ep };
}

describe("Basic Commit Tests", () => {
    let workDir: string;
    let cleanupWorkDir: () => void;
    let adaptConfig: ServerConfig

    beforeEach(async () => {
        const { path, cleanup } = await tmp.dir({
            prefix: 'basic_commit_tests',
            unsafeCleanup: true
        });
        workDir = path;
        cleanupWorkDir = cleanup;
        adaptConfig = await loadAdaptGitServerConfig(configPath);
    });

    afterEach(async () => {
        cleanupWorkDir();
    });

    it("Should update latestKey on commit", async () => {
        const git = sg(workDir);
        await git.clone("ssh://git@git-server/repo.git", workDir);
        await exec(`echo This is an update > somefile.txt`, { cwd: workDir });
        await git.addConfig("user.email", "testuser@localdomain");
        await git.addConfig("user.name", "Test User");
        await git.add("somefile.txt");
        await git.commit("Test commit of somefile.txt");
        await git.push("origin");


        const etcdCli = new etcd3.Etcd3({ hosts: adaptConfig.etcd_ep })
        const val = await etcdCli.get(`adapt-${adaptConfig.deployment}-latestRef`);
        const head = await git.revparse(["HEAD"]);

        should(val).equal(head.trim());
    });
});