import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const config = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');
const meta = html.match(/<meta\b(?=[^>]*http-equiv="Content-Security-Policy")[^>]*>/i)?.[0];
const htmlPolicy = meta?.match(/content="([^"]+)"/)?.[1];

// The webview enforces both policies. Allowing IPC in only one still blocks
// native calls such as get_api_port before Tauri falls back to postMessage.
it.each([
  ['Tauri configuration', config.app.security.csp],
  ['renderer HTML', htmlPolicy]
])('%s permits desktop IPC while retaining restrictive script and network rules', (_name, policy) => {
  expect(typeof policy).toBe('string');
  const directives = new Map<string, string[]>(
    (policy as string)
      .split(';')
      .filter((entry) => entry.trim())
      .map((entry) => {
        const [name, ...sources] = entry.trim().split(/\s+/);
        return [name!, sources];
      })
  );
  const connect = directives.get('connect-src')!;
  expect(connect).toEqual(expect.arrayContaining(['ipc:', 'http://ipc.localhost']));
  expect(connect).toEqual(expect.arrayContaining(['http://127.0.0.1:*', 'ws://127.0.0.1:*']));
  for (const broadSource of ['*', 'http:', 'https:', 'ws:', 'wss:']) expect(connect).not.toContain(broadSource);
  expect(directives.get('script-src')).toEqual(["'self'"]);
  for (const directive of ['base-uri', 'form-action', 'object-src', 'frame-src']) {
    expect(directives.get(directive)).toEqual(["'none'"]);
  }
});
