import Adapt, { ChangeType, FinalDomElement, Group, PluginOptions } from "@usys/adapt";
import { createMockLogger, MockLogger } from "@usys/testutils";
import should from "should";
import { ActionPlugin, idFunc } from "../../src/action/action_plugin";
import { Command } from "../../src/action/Command";
import { act, doBuild } from "../testlib";

const prefix = "Running command: ";

describe("Command component", () => {
    let plugin: ActionPlugin;
    let options: PluginOptions;
    let logger: MockLogger;
    const deployID = "cmd123";

    beforeEach(() => {
        plugin = new ActionPlugin();
        logger = createMockLogger();
        options = {
            deployID,
            log: logger.info,
            logger,
            dataDir: "/fake/datadir",
        };
    });

    async function dom1() {
        const orig =
            <Group>
                <Command
                    run={["echo", "run0"]} shouldRun={["false"]}
                    delete={["echo", "del0"]} shouldDelete={["false"]}
                />
                <Command
                    run={["echo", "run1"]} shouldRun={["false"]}
                    delete={["echo", "del1"]} shouldDelete={["true"]}
                />
                <Command
                    run={["echo", "run2"]} shouldRun={["true"]}
                    delete={["echo", "del2"]} shouldDelete={["true"]}
                />
            </Group>;
        const { dom } = await doBuild(orig, { deployID });
        return dom;
    }

    it("Should be named Command", () => {
        should(Command.name).equal("Command");
        const orig = <Command run={["echo", "run"]} />;
        should(orig.componentName).equal("Command");
    });

    it("Should execute a command on create", async () => {
        const orig = <Command run={["echo", "run"]} />;
        const { dom } = await doBuild(orig, { deployID });

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        should(obs).eql({
            [idFunc(dom)]: {
                type: ChangeType.create,
                detail: prefix + "echo run",
            }
        });
        const actions = plugin.analyze(null, dom, obs);
        const noFunc = actions.map(({ act: _a, ...rest }) => rest);
        should(noFunc).eql([{
            type: ChangeType.create,
            detail: prefix + "echo run",
            changes: [{
                type: ChangeType.create,
                detail: prefix + "echo run",
                element: dom,
            }]
        }]);

        await act(actions);
        should(logger.stderr).equal("");
        should(logger.stdout).equal("INFO: run\n");
    });

    it("Should conditionally execute a command", async () => {
        const dom = await dom1();
        const kids: FinalDomElement[] = dom.props.children;

        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        should(obs).eql({
            [idFunc(kids[0])]: {
                type: ChangeType.none,
                detail: prefix + "echo run0",
            },
            [idFunc(kids[1])]: {
                type: ChangeType.none,
                detail: prefix + "echo run1",
            },
            [idFunc(kids[2])]: {
                type: ChangeType.create,
                detail: prefix + "echo run2",
            }
        });
        const actions = plugin.analyze(null, dom, obs);
        const noFunc = actions.map(({ act: _a, ...rest }) => rest);
        should(noFunc).eql([
            {
                type: ChangeType.create,
                detail: prefix + "echo run2",
                changes: [{
                    type: ChangeType.create,
                    detail: prefix + "echo run2",
                    element: kids[2],
                }]
            },
            {
                type: ChangeType.none,
                detail: "No action required",
                changes: [
                    {
                        type: ChangeType.none,
                        detail: "No action required",
                        element: kids[0],
                    },
                    {
                        type: ChangeType.none,
                        detail: "No action required",
                        element: kids[1],
                    }
                ]
            }
        ]);

        await act(actions);
        should(logger.stderr).equal("");
        should(logger.stdout).equal("INFO: run2\n");
    });

    it("Should conditionally execute delete commands", async () => {
        const dom = await dom1();
        const kids: FinalDomElement[] = dom.props.children;

        await plugin.start(options);
        const obs = await plugin.observe(dom, null);
        should(obs).eql({
            [idFunc(kids[0])]: {
                type: ChangeType.none,
                detail: prefix + "echo del0",
            },
            [idFunc(kids[1])]: {
                type: ChangeType.delete,
                detail: prefix + "echo del1",
            },
            [idFunc(kids[2])]: {
                type: ChangeType.delete,
                detail: prefix + "echo del2",
            }
        });
        const actions = plugin.analyze(dom, null, obs);
        const noFunc = actions.map(({ act: _a, ...rest }) => rest);
        should(noFunc).eql([
            {
                type: ChangeType.delete,
                detail: prefix + "echo del1",
                changes: [{
                    type: ChangeType.delete,
                    detail: prefix + "echo del1",
                    element: kids[1],
                }]
            },
            {
                type: ChangeType.delete,
                detail: prefix + "echo del2",
                changes: [{
                    type: ChangeType.delete,
                    detail: prefix + "echo del2",
                    element: kids[2],
                }]
            },
            {
                type: ChangeType.none,
                detail: "No action required",
                changes: [
                    {
                        type: ChangeType.none,
                        detail: "No action required",
                        element: kids[0],
                    },
                ]
            }
        ]);

        await act(actions);

        should(logger.stderr).equal("");
        const lines = logger.stdout.split("\n");
        should(lines).containDeep([
            "INFO: del1",
            "INFO: del2"
        ]);
    });

    it("Should check for execution with no DOM change", async () => {
        const oldDom = await dom1();
        const newDom = await dom1();
        const kids: FinalDomElement[] = newDom.props.children;

        await plugin.start(options);
        const obs = await plugin.observe(oldDom, newDom);
        should(obs).eql({
            [idFunc(kids[0])]: {
                type: ChangeType.none,
                detail: prefix + "echo run0",
            },
            [idFunc(kids[1])]: {
                type: ChangeType.none,
                detail: prefix + "echo run1",
            },
            [idFunc(kids[2])]: {
                type: ChangeType.modify,
                detail: prefix + "echo run2",
            }
        });
        const actions = plugin.analyze(oldDom, newDom, obs);
        const noFunc = actions.map(({ act: _a, ...rest }) => rest);
        should(noFunc).eql([
            {
                type: ChangeType.modify,
                detail: prefix + "echo run2",
                changes: [{
                    type: ChangeType.modify,
                    detail: prefix + "echo run2",
                    element: kids[2],
                }]
            },
            {
                type: ChangeType.none,
                detail: "No action required",
                changes: [
                    {
                        type: ChangeType.none,
                        detail: "No action required",
                        element: kids[0],
                    },
                    {
                        type: ChangeType.none,
                        detail: "No action required",
                        element: kids[1],
                    }
                ]
            }
        ]);

        await act(actions);
        should(logger.stderr).equal("");
        should(logger.stdout).equal("INFO: run2\n");
    });
});
