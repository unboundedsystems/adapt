---
id: writing-docs
title: "Adapt Developer: Writing Docs"
---

<!-- DOCTOC SKIP -->

## Overview

Adapt documentation source content is stored alongside the Adapt source code in the [`adapt` repo](https://gitlab.com/unboundedsystems/adapt), primarily in [Markdown](https://en.wikipedia.org/wiki/Markdown) files.
Those source Markdown files, along with automatically generated API documentation files, are pushed to the [`adapt-web` repo](https://gitlab.com/unboundedsystems/adapt-web) for publishing.

The `adapt-web` repo uses [Docusaurus](https://docusaurus.io/) to transform the source Markdown files into a React-based website, which is then hosted by Netlify at [https://adaptjs.org](https://adaptjs.org).

## Setting up

1. Go to your clone of the `adapt` repo

    If you already have an `adapt` repo, change to the root directory of that repo.

    If you don't already have one, clone it like this:

    ```console
    git clone git@gitlab.com:unboundedsystems/adapt.git
    cd adapt
    ```

1. Do an initial build of the docs website

    ```console
    make web-build
    ```

    This command will:

    - Clone the `adapt-web` repo, placing it in the `web` subdirectory of your `adapt` repo.
    - Do a complete build of `adapt` and its libraries, including generating documentation from the source code.
    - Copy all the latest versions of documentation from `adapt` into the `web/docs` directory.
    - Install and build everything within the `web` directory.

1. Run the local preview server

    ```console
    cd web
    make preview
    ```

    This will start a local preview server (in a Docker container) in watch mode that serves the documentation website from your repo.
    You can point your browser to [http://localhost:3000](http://localhost:3000) to see the local preview site.
    As you change the docs (see Authoring workflow below), the changes should be reflected in the local site so you can preview them.

## Authoring workflow

:::note Reminder
All documentation should be authored within the `adapt` source code repo.
Do not edit documentation directly in the `adapt/web` directory, which is a separate repo.

API documentation is written in TSDoc format in the source code.
All other documentation goes in the `adapt/docs` directory.
:::

1. Make changes to `.md` files in the `adapt/docs` directory or to TSDoc comments in source code files.

1. Generate updated documentation and copy to `adapt/web/docs`

    ```console
    make web-docs
    ```

    This command builds the documentation from the Adapt repo and copies it into the `adapt-web` repo, which is in the `adapt/web` directory.

1. The local preview server should notice the changed files and update with the new content.

:::tip
The docusaurus live reload local server seems to have trouble updating with certain types of changes, primarily when there are changes in the `website` directory.
If you don't see the changes you expect, try killing (`Ctrl-C`) the local server and run `make preview` again in the `adapt/web` directory.
:::

## Source code comments

- Source code is documented using TSDoc format, implemented by [API Extractor](https://api-extractor.com). So their [reference guide](https://api-extractor.com/pages/tsdoc/doc_comment_syntax/) for writing comments is the best one to use.
- A subset of Markdown is supported within source code comments, but formatting isn't always the greatest. Use the local preview server to see how your comments will format in the user documentation.

## Markdown document tips

- Docusaurus uses [GitHub flavored markdown](https://guides.github.com/features/mastering-markdown/), as implemented by the [Remarkable](https://github.com/jonschlinkert/remarkable) markdown parser.
- All markdown docs should have a [YAML-based front matter header](https://docusaurus.io/docs/en/doc-markdown#markdown-headers) that contains at least `id` and `title`.

    Example:

    ```yaml
    ---
    id: mydoc
    title: My Document
    ---
    ```

- Embedded HTML is permitted, where required.

    Example:

    ```markdown
    ## This title has <span class="special">extra formatting</span>!
    ```

- Callouts are supported through the [`remarkable-admonitions`](https://github.com/favoloso/remarkable-admonitions) Remarkable plugin

    Example:

    ```markdown
    :::warning
    This is a warning
    :::
    ```

    Supported callout types are:

  - `tip`
  - `note`
  - `important`
  - `caution`
  - `warning`

- Images and other assets go in `docs/assets`

    To keep them organized, please place them in a subdirectory within `docs/assets` that matches the relative path to the markdown file within `docs`.
- For more info, see the [Docusaurus docs](https://docusaurus.io/docs/en/doc-markdown).

## adapt-web repo structure

The interesting directories in the repo are:
| Directory | Content |
|---|---|
| docs | Contains all of the versioned documentation content (Markdown and associated assets). Docs authored & generated in the `adapt` repo get copied here. |
| website | Node.js project directory that contains the Docusaurus configuration and React components, along with static assets from which the website is built. |
| adapt-web-components | A React components library, specific to this site. |
