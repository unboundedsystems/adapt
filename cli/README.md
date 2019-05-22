# Unbounded Adapt CLI

## Command Reference
<!-- commands -->
* [`adapt autocomplete [SHELL]`](#adapt-autocomplete-shell)
* [`adapt deploy:create STACKNAME`](#adapt-deploycreate-stackname)
* [`adapt deploy:destroy DEPLOYID`](#adapt-deploydestroy-deployid)
* [`adapt deploy:list`](#adapt-deploylist)
* [`adapt deploy:status DEPLOYID`](#adapt-deploystatus-deployid)
* [`adapt deploy:update DEPLOYID [STACKNAME]`](#adapt-deployupdate-deployid-stackname)
* [`adapt help [COMMAND]`](#adapt-help-command)

## `adapt autocomplete [SHELL]`

display autocomplete installation instructions

```
USAGE
  $ adapt autocomplete [SHELL]

ARGUMENTS
  SHELL  shell type

OPTIONS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

EXAMPLES
  $ adapt autocomplete
  $ adapt autocomplete bash
  $ adapt autocomplete zsh
  $ adapt autocomplete --refresh-cache
```

_See code: [@unboundedsystems/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v0.1.0-unb2/src/commands/autocomplete/index.ts)_

## `adapt deploy:create STACKNAME`

Create a new deployment for an Adapt project

```
USAGE
  $ adapt deploy:create STACKNAME

OPTIONS
  -d, --debug=debugFlags  Enable additional debug output. Should be a comma-separated list of debug flags. Valid debug
                          flags are: build

  -q, --quiet             Suppress status output messages. Still outputs any result output.

  --dryRun                Show what would happen during deploy, but do not modify the deployment

  --registry=registry     URL of alternate NPM registry to use

  --rootFile=rootFile     [default: index.tsx] Project description file to deploy (.ts or .tsx)

  --serverUrl=serverUrl   URL of Adapt server. Defaults to using local system.

EXAMPLES
  Deploy the stack named "dev" from the default project description file, index.tsx:
       $ adapt deploy:create dev

  Deploy the stack named "dev" from an alternate description file:
       $ adapt deploy:create --rootFile somefile.tsx dev
```

_See code: [dist/src/commands/deploy/create.ts](https://gitlab.com/unboundedsystems/adapt/blob/v0.0.2-next.3/dist/src/commands/deploy/create.ts)_

## `adapt deploy:destroy DEPLOYID`

Destroy an existing deployment of an Adapt project

```
USAGE
  $ adapt deploy:destroy DEPLOYID

OPTIONS
  -d, --debug=debugFlags  Enable additional debug output. Should be a comma-separated list of debug flags. Valid debug
                          flags are: build

  -q, --quiet             Suppress status output messages. Still outputs any result output.

  --dryRun                Show what would happen during deploy, but do not modify the deployment

  --registry=registry     URL of alternate NPM registry to use

  --rootFile=rootFile     [default: index.tsx] Project description file to deploy (.ts or .tsx)

  --serverUrl=serverUrl   URL of Adapt server. Defaults to using local system.

EXAMPLE

  Destroy the deployment "myproj-dev-abcd" using the default project description file, "index.tsx":
       $ adapt deploy:destroy myproj-dev-abcd
```

_See code: [dist/src/commands/deploy/destroy.ts](https://gitlab.com/unboundedsystems/adapt/blob/v0.0.2-next.3/dist/src/commands/deploy/destroy.ts)_

## `adapt deploy:list`

List active Adapt deployments

```
USAGE
  $ adapt deploy:list

OPTIONS
  -d, --debug=debugFlags  Enable additional debug output. Should be a comma-separated list of debug flags. Valid debug
                          flags are: build

  -q, --quiet             Suppress status output messages. Still outputs any result output.

  --rootFile=rootFile     [default: index.tsx] Project description file to deploy (.ts or .tsx)

  --serverUrl=serverUrl   URL of Adapt server. Defaults to using local system.

EXAMPLE
  List all deployments from the server
       $ adapt deploy:list
```

_See code: [dist/src/commands/deploy/list.ts](https://gitlab.com/unboundedsystems/adapt/blob/v0.0.2-next.3/dist/src/commands/deploy/list.ts)_

## `adapt deploy:status DEPLOYID`

Fetch the status of an existing deployment of an Adapt project

```
USAGE
  $ adapt deploy:status DEPLOYID

OPTIONS
  -d, --debug=debugFlags  Enable additional debug output. Should be a comma-separated list of debug flags. Valid debug
                          flags are: build

  -q, --quiet             Suppress status output messages. Still outputs any result output.

  --dryRun                Show what would happen during deploy, but do not modify the deployment

  --registry=registry     URL of alternate NPM registry to use

  --rootFile=rootFile     [default: index.tsx] Project description file to deploy (.ts or .tsx)

  --serverUrl=serverUrl   URL of Adapt server. Defaults to using local system.

EXAMPLES
  Fetch the status of deployment "myproj-dev-abcd" from the default project description file, "index.tsx":
       $ adapt deploy:status myproj-dev-abcd

  Fetch the status of deployment "myproj-dev-abcd" from an alternate description file, "somefile.tsx":
       $ adapt deploy:status --rootFile somefile.tsx myproj-dev-abcd
```

_See code: [dist/src/commands/deploy/status.ts](https://gitlab.com/unboundedsystems/adapt/blob/v0.0.2-next.3/dist/src/commands/deploy/status.ts)_

## `adapt deploy:update DEPLOYID [STACKNAME]`

Update an existing deployment of an Adapt project

```
USAGE
  $ adapt deploy:update DEPLOYID [STACKNAME]

OPTIONS
  -d, --debug=debugFlags  Enable additional debug output. Should be a comma-separated list of debug flags. Valid debug
                          flags are: build

  -q, --quiet             Suppress status output messages. Still outputs any result output.

  --dryRun                Show what would happen during deploy, but do not modify the deployment

  --registry=registry     URL of alternate NPM registry to use

  --rootFile=rootFile     [default: index.tsx] Project description file to deploy (.ts or .tsx)

  --serverUrl=serverUrl   URL of Adapt server. Defaults to using local system.

EXAMPLES
  Update the deployment "myproj-dev-abcd", from the default project description file, "index.tsx":
       $ adapt deploy:update myproj-dev-abcd

  Update the deployment "myproj-dev-abcd", using the stack named "dev" from an alternate description file, 
  "somefile.tsx":
       $ adapt deploy:update --rootFile somefile.tsx myproj-dev-abcd dev
```

_See code: [dist/src/commands/deploy/update.ts](https://gitlab.com/unboundedsystems/adapt/blob/v0.0.2-next.3/dist/src/commands/deploy/update.ts)_

## `adapt help [COMMAND]`

display help for adapt

```
USAGE
  $ adapt help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.1.3/src/commands/help.ts)_
<!-- commandsstop -->
