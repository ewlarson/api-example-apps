import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
// The repository deploys these sources verbatim. Check every existing app/template,
// not just Map Memory, without introducing a build system.
test('all static app and gallery links/assets resolve under the Pages subpath', async () => {
  const repo = root;
  const entries = ['index.html'];
  for (const folder of ['apps', 'templates']) {
    for (const entry of await readdir(path.join(repo, folder), { withFileTypes: true })) {
      if (entry.isDirectory()) entries.push(`${folder}/${entry.name}/index.html`);
    }
  }
  for (const entry of entries) {
    const html = await readFile(path.join(repo, entry), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const value = match[1];
      if (/^(https?:|mailto:|#|data:)/.test(value)) continue;
      assert(!value.startsWith('/'), `${entry}: root-relative asset would escape Pages subpath: ${value}`);
      const target = path.resolve(repo, path.dirname(entry), value.split(/[?#]/)[0]);
      const info = await stat(target);
      if (info.isDirectory()) await stat(path.join(target, 'index.html'));
    }
  }
  const gallery = await readFile(path.join(repo, 'index.html'), 'utf8');
  assert.match(gallery, /href="apps\/map-memory\/"/);
});
