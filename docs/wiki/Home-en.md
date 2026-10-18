# Qiye widget technical documentation

[简体中文](Home.md) · **English** · [Project home](../../README.en.md) · [Documentation index](../README.en.md)

This wiki explains widget architecture, contracts, data limits and verification for authors and maintainers. It covers **native widget API v3, community protocol v1 and desktop schema 5**. Version history lives in [CHANGELOG.md](../../CHANGELOG.md).

## Start here

| Goal | Reading path |
| --- | --- |
| Understand built-in widgets, sizes and data | [Widget overview](Widgets-Overview-en.md) |
| Build a widget bundled with the extension | [Native widgets](Native-Widgets-en.md) → [Testing and contributing](Widget-Testing-en.md) |
| Publish a webpage you host yourself | [Community widgets](Community-Widgets-en.md) → [Testing and contributing](Widget-Testing-en.md) |
| Maintain lifecycle, persistence or UI | [Widget overview](Widgets-Overview-en.md) → [Native widgets](Native-Widgets-en.md) |
| Use subscriptions or share a desktop | [Community and sharing user guide (Chinese)](../COMMUNITY.md) |

## Two integration models

**Native widgets** are trusted ES Modules reviewed and bundled with Qiye. They render on the desktop and use the registry, generated configuration forms and lifecycle API. Arbitrary remote scripts cannot be installed as native widgets.

**Community widgets** are independently hosted webpages discovered through public JSON manifests. The desktop shows a static launcher. An isolated iframe loads only after the user clicks **Run** in the detail window; the SDK exchanges only instance data and display environment.

These versions are independent: native `apiVersion: 3`, community manifest `version: 1` and desktop `schemaVersion: 5` describe different contracts.

## Documentation conventions

- Chinese is the default language. Every technical page has an English counterpart with matching examples, limits and return values.
- Source links and examples refer to existing repository files. Run commands from the repository root.
- Qiye is in development and accepts only current APIs and complete data formats. Older formats are not migrated.
- Edit the sources in `docs/wiki/`, then generate the Wiki pages. See [Wiki maintenance (Chinese)](../WIKI.md).

[Next: widget overview →](Widgets-Overview-en.md)
