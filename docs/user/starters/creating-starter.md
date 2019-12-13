---
id: creating-starter
title: "Creating an Adapt starter"
---
<!-- DOCTOC SKIP -->

## Adapt starters

An Adapt starter is a collection of files that serve as a template for starting a new development project.
Starters are not limited to just set up the Adapt-specific portions of a new project.
In fact, the best starters should strive to set up a template environment for complete applications.
A single starter can even include set up for multiple different application components, such as web front-ends, mobile apps, and multiple back end services or microservices, all potentially using different languages and technologies.

## How a starter works

Starters are used by the `adapt new <starter> <target_dir> <optional_args>` command.
The user specifies the starter they want to use and a target directory that will be created and populated by the starter.

The `adapt new` command performs the following steps:

1. Download the starter.

    If the `<starter>` parameter is not a local file or directory, Adapt will download the referenced starter to a local temporary directory.

1. Create the target directory.

    Creates the target directory that the user specified, if the directory doesn't already exist.

1. Copy files.

    Copies any files and directories specified by the `files` property in `adapt_starter.json` from the starter directory into the target directory.

1. Update Adapt project dependencies

    See [specifying Adapt dependencies](#specifying-adapt-dependencies).

1. Run starter init script

    If the `init` property is present in `adapt_starter.json`, run the command specified.
    See [Running an init script](#running-an-init-script).

## Structure of a starter

All Adapt starters must have an `adapt_starter.json` file present in their top level directory.
Other than that requirement, there are no other restrictions on the directory and file layout of a starter,
This is intentional so that the author of a starter is free to create a layout that aligns to whatever standards or conventions are appropriate for the type of application, language, or framework that the starter is setting up.

## adapt_starter.json

This is the only file required to be present in an Adapt starter.
It is required to be placed in the root directory of the starter and is written in JSON.
Adapt accepts either standard [JSON](https://tools.ietf.org/html/rfc7159) or [JSON 5](https://json5.org/) format for this file.
JSON 5 is a superset of standard JSON that allows comments and has other human-friendly features.

The `adapt_starter.json` file contains information that describes the starter and instructs Adapt on how to process the files in the starter during the `adapt new` command.
It must contain a single object, which can have the following properties:

| Property | Required | Type | Default | Description |
| --- | --- | --- | --- | --- |
| adaptDir | no | <code>string &#124; string[]</code> | `"deploy"` | Relative paths to directories within the target directory that are Adapt projects |
| files | no | <code>string &#124; string[]</code> | No files will be copied | Paths to files or directories within the starter that should be copied to the target directory |
| init | no | `string` | No init script will be run | A shell command to execute after all files have been copied to the target directory. See [Running an init script](#running-an-init-script) |
| name | yes | `string` | | Name of this starter. Should be a single word, in lower case, and may contain hyphens or underscores |
| version | no | `string` | No version | Version of the starter in [SemVer](https://semver.org/) format |

Any additional properties on the `adapt_starter.json` object are ignored.
However, later versions of Adapt may define more properties, so it is not recommended at this time to set properties other than those defined here.

## Running an init script

During execution of the `adapt new` command, after any files or directories specified by the `files` property have been copied into the target directory, the starter's init script, specified by the `init` property in `adapt_starter.json` will be invoked.
To run the init script, `adapt new` constructs a string to pass to the default system shell (typically `/bin/sh`), consisting of the `init` property string, plus any additional arguments that the user gave to `adapt new`, after performing shell quoting.
It then passes the resulting command line string to the system shell with the working directory set to the target directory.

## Specifying Adapt dependencies

Starters typically create one or more Adapt project directories within the target directory, each with a `package.json` file that includes dependencies, such as `@adpt/core` and `@adpt/cloud`.
When a starter copies or creates those `package.json` files, it must specify versions of those dependencies, using the [standard format](https://docs.npmjs.com/files/package.json#dependencies) allowed in `package.json` files.

In addition to the standard dependency version format, Adapt also supports the special value `"CURRENT"` for certain known dependencies.
When `"CURRENT"` is used as the version for a known dependency, `adapt new` will overwrite that value with versions that are compatible with the version of Adapt CLI that's being used.
Or, if the user specifies a particular Adapt version with the `adapt new` option `--adaptVersion`, `"CURRENT"` will be overwritten with versions that are compatible with the specified version of Adapt.
Note that `"CURRENT"` must be all upper case.

In order to use the special value `"CURRENT"`, the `adaptDir` property in `adapt_starter.json` must specify the path to each of the Adapt project directories that contain a `package.json` file.

For example, if your starter wants to create an Adapt project in a subdirectory called `myapp`, it could place the two files below into the starter.
Notice that `adaptDir` in `adapt_starter.json` references the `myapp` directory, where `package.json` is located.

**`myapp/package.json`**:

```json
{
  "name": "myapp-adapt-project",
  "version": "1.0.0",
  "dependencies": {
    "@adpt/core": "CURRENT",
    "@adpt/cloud": "CURRENT",
    "@types/node": "^8.10.20",
    "source-map-support": "^0.5.6",
    "typescript": "^3.0.3"
  }
}
```

**`adapt_starter.json`**:

```json
{
    "name": "myapp-starter",
    "adaptDir": "myapp"
}
```

The following list of known packages support the special value `"CURRENT"`:

- `@adpt/cli`
- `@adpt/cloud`
- `@adpt/core`
- `@adpt/utils`

## Sharing your starter

The `adapt new` command supports automatic retrieval of starters from many types of locations, including:

- The Adapt starter gallery
- Local directory
- Local or remote tar file
- A git repo, including GitHub or GitLab
- An NPM-compatible registry, such as [npmjs.org](https://npmjs.org)

For each of these, the `adapt_starter.json` must be present in the top level directory.
So for a tar file, `adapt_starter.json` must be in the root of the directory structure within the file.
For a git repo, `adapt_starter.json` must be in the root directory of the repo.
When published as an NPM package, `adapt_starter.json` must be in the root directory of the package.

## Version compatibility with Adapt

In order to allow starters to work with multiple different versions of Adapt, the `adapt new` command will attempt to fetch a version of the starter that is compatible with the version of Adapt CLI that is running.
This functionality is only supported when the user specifies a starter using one of the following:

- Name of a starter from the Adapt starter gallery
- Git repo URL
- GitHub or GitLab reference
- Name of an NPM package

The `adapt new` command will attempt to load multiple different versions of a starter, beginning with one that corresponds to the exact version of Adapt CLI currently running, then trying less exact version matches and finally trying to load a default version of the starter.
The starter author controls which version of the starter corresponds to a particular Adapt version via [dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages) (sometimes just called tags) for NPM-based starters or using [tags](https://git-scm.com/book/en/v2/Git-Basics-Tagging) or [branches](https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell) for git-based starters.

In all cases, the tags or branches that `adapt new` tries to fetch start with `adapt-v`, followed by all or a portion of the Adapt CLI version string.

`adapt new` will attempt to fetch tags/branches of the starter in the order shown below.
For the examples, assume that the version of the CLI running `adapt new` is `1.2.3-next.1`.

- The exact version of the Adapt CLI

    This includes any pre-release label.

    Example: `adapt-v1.2.3-next.1`

- Major.Minor.Patch

    Example: `adapt-v1.2.3`

- Major.Minor

    Example: `adapt-v1.2`

- Major

    Example: `adapt-v1`

- Default version

    For a git repo, this is the default branch, typically called `master`.
    For an NPM package, this is the tag `latest`.
