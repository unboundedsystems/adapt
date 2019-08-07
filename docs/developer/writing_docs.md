---
id: writing-docs
title: "Adapt Developer: Writing Docs"
---

<!-- DOCTOC SKIP -->

## Overview
Adapt documentation source content is stored alongside the Adapt source code in the [`adapt` repo](https://gitlab.com/unboundedsystems/adapt), primarily in [Markdown](https://en.wikipedia.org/wiki/Markdown) files.
Those source Markdown files, along with automatically generated API documentation files, are pushed to the [`adapt-web` repo](https://gitlab.com/unboundedsystems/adapt-web) for publishing.

The `adapt-web` repo uses [Docusaurus](https://docusaurus.io/) to transform the source Markdown files into a React-based website, which is then hosted by Netlify at [https://adapt.unbounded.systems](https://adapt.unbounded.systems).

## Setting up

1. Check out the `adapt-web` repo

    ```console
    git clone git@gitlab.com:unboundedsystems/adapt-web.git
    cd adapt-web
    ```
    The interesting directories in the repo are:
    | Directory | Content |
    |---|---|
    | docs | Contains all of the versioned documentation content (Markdown and associated assets) |
    | website | Node.js directory project that contains the Docusaurus configuration and React components, along with static assets from which the website is built. |
    | adapt-web-components | A React components library, specific to this site |

1. Install node modules

    ```console
    yarn
    ```

1. Run the local preview server

    ```console
    cd website
    yarn start
    ```
    This will start a local server in watch mode on [http://localhost:3000](http://localhost:3000) that serves the website from your repo and will start a browser showing the site.
    As you change the content in the `docs` directory, the changes should be reflected in the local site so you can preview them.

## Authoring/updating workflow

> **Reminder**
>
> All documentation should be authored within the [`adapt` source code repo](https://gitlab.com/unboundedsystems/adapt).
>
> API documentation is written in TSDoc format in the source code.
> All other documentation goes in the `docs` directory.

1. Make changes to `.md` files in the `adapt` repo `docs` directory or to TSDoc comments in source code files.

1. Generate updated documentation artifacts

    Substitute the path to the `docs` subdirectory of your clone of the `adapt-web` repo in the following command:

    ```console
    ADAPT_ARTIFACT_DOCS=/your/path/to/adapt-web/docs make docs artifacts
    ```
    This command builds the documentation artifacts from the Adapt repo and copies them into the `adapt-web` repo, to the location you specified,

    It does **not** currently delete files from the target directory, so please handle moving files with care.
    
    Generally speaking, it should be safe to remove the entire `docs` directory from `adapt-web` and re-generate the current version with the artifacts build command from `adapt`.

1. The local server should notice the changed files and update with the new content.

    > **Tip**
    >
    > The docusaurus live reload local server seems to have trouble updating with certain types of changes, primarily when there are changes in the `website` directory.
    > If you don't see the changes you expect, try killing (`Ctrl-C`) the local server and run `yarn start` again in the `website` directory.

## Markdown doc tips

- Docusaurus uses [GitHub flavored markdown](https://guides.github.com/features/mastering-markdown/), as implemented by the [Remarkable](https://github.com/jonschlinkert/remarkable) markdown parser.
- All markdown docs should have a [YAML-based front matter header](https://docusaurus.io/docs/en/doc-markdown#markdown-headers) that contains at least `id` and `title`.

    Example:
    ```
    ---
    id: mydoc
    title: My Document
    ---
- Embedded HTML is permitted, where required.

    Example:
    ```
    ## This title has <span class="special">extra formatting</span>!
    ```
- Images and other assets go in `docs/assets`

    To keep them organized, pleaes place them in a subdirectory within `docs/assets` that matches the relative path to the markdown file within `docs`.
- For more info, see the [Docusaurus docs](https://docusaurus.io/docs/en/doc-markdown)