# Native widget development · API v3

[Wiki home](Home-en.md) · [简体中文](Native-Widgets.md) · **English**

Native widgets are trusted modules bundled with Qiye. This reference follows [widget-registry.js](../../src/widget-registry.js), [widgets.js](../../src/widgets.js) and [widget-runtime.js](../../src/widget-runtime.js). Self-hosted webpages use the separate [community API](Community-Widgets-en.md).

## Quick start

1. Register the included [counter example](../../src/widget-example.js) in [widget-extensions.js](../../src/widget-extensions.js):

```js
import { counterWidget } from './widget-example.js';
export const widgetExtensions = [counterWidget];
```

2. Run `python scripts/build-preview.py` from the repository root, then reload the extension or open the generated `Qiye-preview.html`.
3. Add two counters through **Add → Widgets**, increment them separately, change labels and reload. Confirm that each instance retains its own values. The example is disabled by default.
4. To create your own widget, copy the example to `src/widget-yourname.js`, choose a unique `type` and register the exported definition.

The preview builder supports the project's named imports/exports and bundles dependencies in order. Unsupported imports and dependency cycles fail the build. Use lowercase letters, digits and hyphens in module filenames. Keep module top levels free of DOM, network and storage side effects: service workers and the toolbar popup also load the registry.

## Definition contract

This is a valid read-only definition. The later `mount` example covers interaction and saving. The definition declares three sizes; undeclared sizes are not offered by the chooser.

```js
export const sampleWidget = {
  apiVersion: 3,
  type: 'sample',
  title: '示例组件',
  description: '展示当前实例的文本和计数',
  icon: 'note',
  size: '2x2',
  sizes: ['1x1', '2x2', '4x2'],
  fields: [
    { key: 'text', label: '内容', type: 'text', default: '', maxLength: 500 },
    { key: 'count', label: '数量', type: 'number', default: 0, min: 0, max: 9999, integer: true },
    { key: 'enabled', label: '启用', type: 'checkbox', default: false },
    { key: 'mode', label: '模式', type: 'select', default: 'simple',
      options: [{ value: 'simple', label: '简洁' }, { value: 'full', label: '完整' }] },
  ],
  render({ config, escapeHtml, size }) {
    if (size === '1x1') return `<strong>${config.count}</strong>`;
    return `<p>${escapeHtml(config.text)}</p><strong>${config.count}</strong>`;
  },
};
```

Chinese source strings follow Qiye's translation-key convention. Add their English translations to the shared dictionary before shipping.

| Field | Constraint |
| --- | --- |
| `apiVersion` | Must be integer `3` |
| `type` | Matches `^[a-z][a-z0-9-]{0,39}$`; unique, not a built-in type, `constructor` or `prototype` |
| `title` / `description` | Nonempty strings, up to 160 characters each |
| `icon` | An icon name provided by [icons.js](../../src/icons.js) |
| `size` | Defaults to `2x2`; must belong to `sizes` |
| `sizes` | Defaults to `['1x1', '2x2']`; both required, unique, drawn from the host's size set |
| `fields` | Defaults to an empty array; keys must be unique and every field needs a valid `default` |
| `render(context)` | Required; synchronously returns an HTML string |
| `mount(context)` | Optional; synchronously returns a cleanup function or `undefined` |
| `update(context)` | Optional; synchronously updates existing DOM; no Promise return |

### Configuration fields

Keys match `^[a-zA-Z][a-zA-Z0-9_]{0,39}$` and cannot be `constructor`, `prototype` or `__proto__`. Labels are nonempty strings of up to 80 characters.

| Type | Metadata and values |
| --- | --- |
| `text` | String; `maxLength` defaults to 1000 and accepts 1–100000; `required: true` rejects blank values |
| `number` | Finite number; `min` / `max` default to -1000000 / 1000000, with declared bounds within ±1e12; `integer: true` requires integers |
| `checkbox` | Boolean; strings and numbers are not coerced |
| `select` | 1–40 `{ value, label }` options; unique values up to 80 characters, nonempty labels up to 80 characters; the value must match an option |

Defaults are generated only when creating an instance through `newWidgetConfig(type)` / registry `newConfig(type)`. Missing/unknown configuration fields and invalid values are rejected on import. Custom fields currently support scalars only; nested JSON requires an explicit design for validation and limits.

## Rendering and lifecycle

`render` receives `{ item, config, escapeHtml, t, locale, size }`. Both `item` and `config` are copies. The host creates `.widget-inner`, instance identifiers and the applicable title bar; return only the inner HTML. Escape user text with `escapeHtml()` or use `textContent`. Validate URL protocols and origins separately.

The catalog calls the same `render` for inert static previews, without mounting or fetching data. Rendering must therefore have no side effects and cannot depend on globals initialized during mounting.

```text
render → insert DOM → mount → update (repeatable) → signal.abort + cleanup
Catalog preview: render → static display
```

Switching groups, replacing nodes or rebinding aborts `signal` and invokes cleanup. Ordinary reordering usually reuses nodes; do not rely on remounting to refresh state. Start asynchronous work inside `mount`, and check `signal.aborted` after completion. Clean up timers, subscriptions and observers you create.

Rendering failures show an error placeholder. One instance's `mount` / `update` failure does not block others. A mount failure aborts that instance's signal; an update failure stops later updates for that mount and reports the error. Catch errors in asynchronous event handlers yourself.

### mount / update context

| API | Behavior |
| --- | --- |
| `root` | Current `.widget-inner`; scope element queries to it |
| `signal` | AbortSignal for this mount; usable with listeners and fetch |
| `size` | Current presentation size; native details render as `2x2` without changing the desktop size |
| `locale` / `t(message, values)` | `zh-CN` or `en`, shared translation and placeholder substitution |
| `formatDate(value, options)` / `formatNumber(value, options)` | Format using the current language |
| `getConfig()` | Deep copy of the current config; read it again for each operation |
| `await updateConfig(patch)` | Merge, validate and save through the host; `true` on success, `false` if the instance is invalid when called; throws on validation or save failure |
| `openSettings()` / `openDetail()` | Request this instance's settings or detail view |
| `toast(text)` | Show feedback while the instance remains active |

`updateConfig()` does not rerun `render`: after saving it calls the current instance's `update`, which must refresh changed DOM. Mutating a value returned by `getConfig()` does not persist it. Failed saves roll back the config when it still represents that operation. The host may already have reported an error (`error.notified`).

These methods can be added to a definition with a `[data-increment]` button and a `[data-count]` output. See [widget-example.js](../../src/widget-example.js) for the complete working widget:

```js
mount({ root, signal, getConfig, updateConfig, toast }) {
  const button = root.querySelector('[data-increment]');
  button.addEventListener('click', async event => {
    event.stopPropagation();
    button.disabled = true;
    try {
      await updateConfig({ count: Math.min(9999, getConfig().count + 1) });
    } catch (error) {
      if (!error.notified) toast(error.message);
    } finally {
      if (!signal.aborted) button.disabled = false;
    }
  }, { signal });
},
update({ root, getConfig }) {
  root.querySelector('[data-count]').textContent = String(getConfig().count);
},
```

Disabling the button until saving completes prevents overlapping writes from that interaction. Do not use the host-reserved `data-action="widget-…"` prefix. Use native buttons, inputs and links.

## Sizes, previews and details

[widget-sizes.js](../../src/widget-sizes.js) defines all dimensions. Default grid cells are 60 px with 30 px gaps; labels occupy gaps rather than increasing card height.

| size | Default width × height (CSS px) | Suggested layout |
| --- | --- | --- |
| `1x1` | 60 × 60 | One value or direct action |
| `1x2` | 60 × 150 | Vertical information hierarchy |
| `2x1` | 150 × 60 | Value and description side by side |
| `2x2` | 150 × 150 | Compact complete view |
| `4x2` | 330 × 150 | Columns or additional information |

Each dimension is `span × cell + (span - 1) × gap`. Below a 1350 px viewport, dimensions scale by `viewportWidth / 1350`, with a minimum factor of 0.8: a default cell is at least 48 px. Users can change cell size and gaps, and available columns may constrain width. Do not hard-code the table as the only possible container dimensions.

API v3 uses the author's `render` / `mount` / `update` at every declared size, including `1x1`. The root exposes `data-display-size`; compact sizes omit the host title bar. Each catalog card selects its own preview size, which is used when adding the widget.

`openDetail()` renders the same native instance at `2x2` without saving that presentation size. Window presets of 75 / 100 / 125 / 150% change available space and reflow content; they do not use CSS zoom.

## Dragging, themes and localization

The host handles dragging, groups, duplication, deletion/undo and keyboard ordering. Holding any part of a widget for about 400 ms starts dragging. Short clicks keep their actions. Text editing and touch scrolling retain their behavior. Do not add drag handles or intercept host capture-phase pointer events. Esc cancels, Enter opens a focused card and Alt + arrow keys reorder it.

Add CSS to an already loaded stylesheet, such as `src/widgets.css`, scoped under `[data-widget="your-type"]`. Use semantic variables including `--w-bg`, `--w-fg`, `--w-muted`, `--w-accent` and `--w-accent-ink`. Avoid hard-coded white inputs, options or text. Support `settings.useThemeColor`, both themes and reduced motion.

Register UI strings in Chinese and English and format dates/numbers with the context helpers. Language changes trigger rendering/remounting; do not translate user content. See [I18N.md (Chinese)](../I18N.md).

## Persistence and networking

Native extension state belongs in the complete `config`; `data` remains `{}`. See the [data model](Widgets-Overview-en.md#data-model-and-limits) for quotas, schema, backup and draft boundaries. A JSON/WebDAV recipient must also have the same widget type installed, or validation rejects the import.

Network features should be explicitly enabled. Request additional site permissions only from user actions. Provide timeouts, cancellation, caching, deduplication and failure states. Preserve the extension CSP; do not add `eval`, inline handlers or remote execution. `escapeHtml` escapes text and does not validate URLs.

Bundled contributions follow the repository's [contribution and license rules (Chinese)](../../CONTRIBUTING.md#组件与授权) and retain author notices. Independent webpages use the [community integration](Community-Widgets-en.md).

[Next: testing and contributing →](Widget-Testing-en.md)
