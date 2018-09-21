import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as should from "should";
import { loadAwsCreds } from "../../src";
// tslint:disable-next-line:no-var-requires
const mockedEnv = require("mocked-env");

type EnvRestore = () => void;
describe("AWS test credentials", () => {
    let envRestore: undefined | EnvRestore;
    let origdir: string;
    let tmpdir: string;

    beforeEach(async () => {
        envRestore = undefined;
        origdir = process.cwd();
        const base = path.join(os.tmpdir(), "adapt-testutils-");
        tmpdir = await fs.mkdtemp(base);
        process.chdir(tmpdir);
    });
    afterEach(async () => {
        process.chdir(origdir);
        await fs.remove(tmpdir);
        if (envRestore) envRestore();
    });

    it("Should get creds from env", async () => {
        envRestore = mockedEnv({
            AWS_ACCESS_KEY_ID: "env_key_id",
            AWS_SECRET_ACCESS_KEY: "env_secret",
            AWS_DEFAULT_REGION: "env_region",
        });
        const creds = await loadAwsCreds({credsFile: "./awscreds"});
        should(creds).eql({
            awsAccessKeyId: "env_key_id",
            awsSecretAccessKey: "env_secret",
            awsRegion: "env_region",
        });
    });

    it("Should fail when no creds are set", async () => {
        envRestore = mockedEnv({
            AWS_ACCESS_KEY_ID: undefined,
            AWS_SECRET_ACCESS_KEY: undefined,
            AWS_DEFAULT_REGION: undefined,
        });
        return should(loadAwsCreds({credsFile: "./awscreds"}))
            .be.rejectedWith(/Unable to find AWS credentials/);
    });

    it("Should get creds from file", async () => {
        const fileCreds = {
            awsAccessKeyId: "key_id",
            awsSecretAccessKey: "secret",
            awsRegion: "region",
        };
        envRestore = mockedEnv({
            AWS_ACCESS_KEY_ID: undefined,
            AWS_SECRET_ACCESS_KEY: undefined,
            AWS_DEFAULT_REGION: undefined,
        });
        await fs.writeJson("./awscreds", fileCreds);
        const creds = await loadAwsCreds({credsFile: "./awscreds"});
        should(creds).eql(fileCreds);
    });

});
