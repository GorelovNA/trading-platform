// Local production-proof server only; hosting is configured separately in step 8.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { root } from './check-toolchain.mjs';

const directory = resolve(root, 'dist/trading-platform/browser');
const headers = Object.fromEntries(
  (await readFile(resolve(directory, '_headers'), 'utf8'))
    .split('\n')
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    }),
);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
};
// Mirror only the explicit static-host rewrites; missing assets must remain 404s.
const routes = new Map(
  (await readFile(resolve(directory, '_redirects'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .filter(([, target, status]) => target === '/' && status === '200')
    .map(([path]) => [path, '/index.html']),
);
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(
      directory,
      `.${path === '/' ? '/index.html' : (routes.get(path) ?? path)}`,
    );
    if (!file.startsWith(`${directory}${sep}`) || !mime[extname(file)]) {
      response.writeHead(404, headers).end();
      return;
    }
    const body = await readFile(file);
    response
      .writeHead(200, {
        ...headers,
        'Content-Type': mime[extname(file)],
        'Cache-Control': 'no-store',
      })
      .end(body);
  } catch {
    response.writeHead(404, headers).end();
  }
}).listen(Number(process.env.PREVIEW_PORT ?? 4173), '127.0.0.1', function () {
  console.log(`Production proof: http://127.0.0.1:${this.address().port}`);
});
