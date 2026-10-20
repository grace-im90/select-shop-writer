import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = new URL('https://grace-im90.github.io/select-shop-writer/');
const paths = [
  'index.html', 'products/index.html', 'products/sold/index.html',
  'cloud.js', 'cloud-core.js', 'cloud-patches.js', 'product-editor.js',
  'products/management.js', 'products/storage.js', 'products/photo-cache.js', 'title-copy.js'
];
const expected = new Map(await Promise.all(paths.map(async path => [path, await readFile(new URL('../' + path, import.meta.url), 'utf8')])));
let failures = [];
for (let attempt = 1; attempt <= 6; attempt++) {
  failures = [];
  await Promise.all(paths.map(async path => {
    try {
      const url = new URL(path, base);
      url.searchParams.set('verify', process.env.GITHUB_SHA || String(Date.now()));
      const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      assert.equal(response.status, 200, path + ' HTTP status');
      assert.equal(await response.text(), expected.get(path), path + ' deployed content differs from this commit');
    } catch (error) { failures.push(path + ': ' + error.message); }
  }));
  if (!failures.length) break;
  console.log('Deployment check attempt ' + attempt + ': ' + failures.map(message => message.split(':')[0]).join(', '));
  if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 5000));
}
if (failures.length) throw new Error(failures.join('\n'));
console.log('Verified HTTP 200 and matching deployed content for all ' + paths.length + ' pages and assets.');
