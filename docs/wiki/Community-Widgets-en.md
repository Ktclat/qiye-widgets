# Community widget development · Protocol v1

[Wiki home](Home-en.md) · [简体中文](Community-Widgets.md) · **English**

Community widgets are HTTPS webpages hosted by their authors. A subscription adds a static desktop launcher; the iframe loads only after the user clicks **Run** in its details. This page covers manifests, SDK, messaging and distribution. See [COMMUNITY.md (Chinese)](../COMMUNITY.md) for user subscriptions and layout sharing.

## Minimal integration

1. Copy [counter/index.html](../../community/examples/counter/index.html) and [sdk.js](../../community/sdk.js) to your static website, adjusting the example's relative SDK import.
2. Allow iframe embedding and module loading from an opaque-origin sandbox.
3. Publish the following JSON manifest, replacing the example author, URLs and license information.
4. Paste its direct HTTPS URL into **Add → Community**, then read and subscribe. Add the widget, open its details and click **Run**.
5. Interact, close and reopen to verify persistence. Add a second instance to verify independent data.

## Manifest reference

```json
{
  "format": "qiye-widget",
  "version": 1,
  "id": "yourname.counter",
  "name": "我的计数器 / My counter",
  "description": "每张卡片独立保存的计数器 / An independent counter for each card",
  "author": "Your name",
  "release": "1.0.0",
  "entry": "https://yourname.github.io/widgets/counter/index.html",
  "repository": "https://github.com/yourname/widgets",
  "license": "MIT",
  "sizes": ["1x1", "1x2", "2x1", "2x2", "4x2"],
  "previews": [
    {"size": "1x1", "url": "https://yourname.github.io/widgets/counter/1x1.png"},
    {"size": "2x2", "url": "https://yourname.github.io/widgets/counter/2x2.png"}
  ]
}
```

The contract is implemented in [community-format.js](../../src/community-format.js) and [public-json.js](../../src/public-json.js). All listed manifest fields are required; unknown fields are rejected.

| Field | Constraint |
| --- | --- |
| `format` / `version` | Exactly `qiye-widget` / integer `1` |
| `id` | Up to 80 characters; matches `^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$` |
| `name` / `author` / `license` | Nonempty strings, up to 80 characters each |
| `description` | Nonempty string, up to 500 characters |
| `release` | Up to 30 characters, three numeric components such as `1.0.0`; no `-beta` suffix |
| `entry` / `repository` | Public HTTPS domain URLs, up to 2048 characters each |
| `sizes` | 2–5 unique sizes; `1x1` and `2x2` required, with optional `1x2`, `2x1`, `4x2` |
| `previews` | 0–5 `{ size, url }` entries; declared, unique sizes and public HTTPS URLs up to 2048 characters |

Names and descriptions are single strings, not language maps. You may combine Chinese and English text; the host does not translate author manifests. `license` is an author declaration, not automated license approval. Missing previews show a placeholder. Do not add host JavaScript, CSS or executable fields.

Source, entry, repository and preview URLs reject credentials, ports other than 443, literal IP addresses, localhost and `.local` names. This is URL validation, not a review of the author's content or network behavior.

### Source indexes

A single manifest can be subscribed to directly. For a catalog, use this structure, where `manifest` is the full object above:

```js
const source = {
  format: 'qiye-widget-source',
  version: 1,
  name: '我的组件 / My widgets',
  widgets: [manifest],
};
const json = JSON.stringify(source, null, 2);
```

`name` is nonempty and limited to 80 characters. `widgets` contains up to 50 full manifests with unique IDs, not manifest URLs. Sources are limited to 512 KiB. Each browser can subscribe to up to 20 sources.

## SDK

Host a copy of the repository SDK and call `connectWidget()` from your webpage module. It waits for initialization, checks `event.source === parent`, the version and transferred port, then communicates over a dedicated MessageChannel.

| API | Behavior |
| --- | --- |
| `await connectWidget()` | Connect and return the host API inside the author's iframe |
| `host.data` | Parsed JSON for this instance; initially `null` |
| `host.environment` | Latest `{ locale, theme, size, width, height }` |
| `await host.save(value)` | Save a JSON-serializable value; update `host.data` after acknowledgement; reject on failure or after 10 seconds without acknowledgement |
| `host.onEnvironment(callback)` | Subscribe to changes and return an unsubscribe function; read the initial environment explicitly |

This snippet assumes an `#add` button, `#count` output and `#status` text container:

```js
import { connectWidget } from './sdk.js';

const host = await connectWidget();
const button = document.querySelector('#add');
const output = document.querySelector('#count');
const status = document.querySelector('#status');
const currentCount = () => Number.isSafeInteger(host.data?.count) ? host.data.count : 0;
const applyEnvironment = ({ theme, locale }) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = locale;
};
applyEnvironment(host.environment);
host.onEnvironment(applyEnvironment);
output.textContent = String(currentCount());

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = '';
  try {
    await host.save({ count: Math.min(9999, currentCount() + 1) });
    output.textContent = String(currentCount());
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
```

The host accepts at most 64 KiB of UTF-8 JSON per instance, at most one write per 100 ms, and no concurrent writes. Serialize saves and update persisted UI state after success; excess writes are rejected rather than queued. Host-side `data.value` is a JSON string, while SDK `host.data` is the parsed value.

Environment `size` is the selected desktop card size; `width` / `height` are the actual detail runtime area in CSS pixels. The detail view need not match card dimensions. Reflow to available space and support both themes and `zh-CN` / `en`.

## Message protocol

After iframe load, the host sends initialization with `event.ports[0]`. Subsequent messages use that port:

```js
{
  type: 'qiye:init', version: 1, data: '{"count":0}',
  environment: { locale: 'zh-CN', theme: 'dark', size: '2x2', width: 680, height: 520 }
}
```

| Direction | Message | Meaning |
| --- | --- | --- |
| Widget → host | `{ type: 'ready', version: 1 }` | Handshake complete |
| Host → widget | `{ type: 'environment', environment }` | Runtime size, theme or language changed |
| Widget → host | `{ type: 'save', id, value }` | id is a string up to 80 characters; value is JSON text |
| Host → widget | `{ type: 'saved', id, ok: true }` | Persistence succeeded |
| Host → widget | `{ type: 'saved', id, error: '…' }` | Validation, rate or save failure |

The host allows 12 seconds from starting the runtime to complete the handshake. Failure removes the iframe and offers retry. Stopping, closing or restarting destroys the iframe, port, observers and listeners; the next runtime performs a new handshake. See [community-widget.js](../../src/community-widget.js).

## Hosting and isolation

The iframe uses `sandbox="allow-scripts"` without `allow-same-origin`, parent navigation, popup, form or download capabilities. It sets `no-referrer`, `credentialless` where supported, and denies camera, microphone, geolocation and clipboard permissions. The host exposes only instance data and display environment, with no desktop website list, other widget content, WebDAV credentials, host fetch or script-execution API.

The author webpage can still make network requests. Normal network metadata and the widget's own data may reach author servers. The sandbox is not a network firewall; do not store passwords or tokens. Do not depend on parent DOM, same-origin cookies or iframe localStorage.

| Hosting requirement | Reason |
| --- | --- |
| Allow cross-origin manifest reads | The web app requires CORS; extensions request source permissions from user actions |
| Use the final manifest URL without redirects | Reads use `redirect: 'error'`, omit credentials and Referer, and time out after 12 seconds |
| Allow iframe embedding | `X-Frame-Options` or CSP `frame-ancestors` can block loading |
| Allow necessary module, font and API cross-origin requests | The sandbox has an opaque origin; services may receive `Origin: null` |
| Prefer immutable versioned paths | Authors can change a URL's remote content; the host does not pin its bytes |

Opening the catalog loads author preview images. A widget that has not been run may still have caused preview requests. Subscriptions are stored separately under local `qiye.community.v1`, outside backups and WebDAV. Installed cards include their manifest, source URL and own data in desktop backups; public layout sharing clears instance data.

## Publishing and updates

Authors can maintain independent sources or register in the public catalog:

1. Add the full manifest as `community/widgets/author.widget.json`.
2. Run `node scripts/build-community.mjs` and `npm test`.
3. Open a PR with author, source, license, runtime domains, data usage, size previews and verification results.
4. After merging and Pages deployment, users can refresh the public source to discover it. The catalog registers manifests without hosting the author's project.

Refreshing a source updates only its catalog. The user must explicitly update installed widgets to replace manifests with the same source and ID while retaining instance data. If a new manifest removes the selected size, it falls back to `2x2`. Read failures retain the last successful catalog, and another source cannot replace an instance by reusing its ID. This is explicit manifest replacement, not guaranteed version ordering or arbitrary host-code installation.

[Next: testing and contributing →](Widget-Testing-en.md)
