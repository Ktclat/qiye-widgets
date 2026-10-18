// SPDX-License-Identifier: GPL-3.0-only
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {listWidgetDefinitions} from '../src/widget-registry.js';
const root=new URL('../',import.meta.url),version=JSON.parse(await readFile(new URL('package.json',root),'utf8')).version;
const files=(await readdir(new URL('manifests/',root))).filter(name=>name.endsWith('.json'));
const manifests=await Promise.all(files.map(name=>readFile(new URL('manifests/'+name,root),'utf8').then(JSON.parse)));
assert.equal(new Set(manifests.map(m=>m.id)).size,manifests.length);
assert.deepEqual(manifests.map(m=>m.id.slice(5)).sort(),listWidgetDefinitions().map(d=>d.type).sort());
for(const m of manifests){assert.equal(m.apiVersion,2);assert.equal(m.release,version);assert.ok(m.sizes.includes('1x1')&&m.sizes.includes('2x2'));assert.equal(new URL(m.entry).pathname,`/qiye-widgets/releases/${version}/widget.html`);}
console.log(`Validated ${manifests.length} manifests for independent release ${version}`);
