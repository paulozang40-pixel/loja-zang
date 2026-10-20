// Servidor local para testar o site com as funções (SuperFrete e Mercado Pago simulados).
// Uso: npm run build && node tests/servidor-local.mjs  -> http://localhost:4321
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

process.env.PEDIDOS_MEMORIA = '1';
process.env.SUPERFRETE_TOKEN ||= 'simulado';
process.env.MP_ACCESS_TOKEN ||= 'simulado';
process.env.ADMIN_SENHA ||= 'senha-local-123';
process.env.SITE_URL = 'http://localhost:4321';

const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  const u = String(url);
  const r = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (u.includes('superfrete.com/api/v0/calculator')) {
    const b = JSON.parse(opt.body);
    const peso = b.products.reduce((s, p) => s + p.weight * p.quantity, 0);
    return r([
      { id: 1, name: 'PAC', price: (19.9 + peso * 6).toFixed(2), delivery_range: { min: 5, max: 8 }, company: { name: 'Correios' } },
      { id: 2, name: 'SEDEX', price: (34.5 + peso * 9).toFixed(2), delivery_range: { min: 2, max: 3 }, company: { name: 'Correios' } },
      peso <= 0.3 ? { id: 17, name: 'Mini Envios', price: '14.80', delivery_range: { min: 6, max: 10 } } : { id: 17, error: 'Peso acima do limite' },
    ]);
  }
  if (u.includes('superfrete.com/api/v0/cart')) return r({ id: 'SF-LOCAL' });
  if (u.includes('/checkout/preferences')) {
    const b = JSON.parse(opt.body);
    return r({ id: 'PREF-LOCAL', init_point: `http://localhost:4321/pedido/?id=${b.external_reference}&r=pendente` });
  }
  if (u.includes('/formularios/')) return new Response('ok');
  return fetchReal(url, opt);
};

const rotas = {
  '/api/frete': (await import('../netlify/functions/frete.mjs')).default,
  '/api/checkout': (await import('../netlify/functions/checkout.mjs')).default,
  '/api/pedido': (await import('../netlify/functions/pedido-status.mjs')).default,
  '/api/mp-webhook': (await import('../netlify/functions/mp-webhook.mjs')).default,
  '/api/admin/pedidos': (await import('../netlify/functions/admin-pedidos.mjs')).default,
};
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.json': 'application/json' };
const DIST = new URL('../dist/', import.meta.url).pathname;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4321');
  const fn = rotas[url.pathname];
  if (fn) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const resp = await fn(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    res.writeHead(resp.status, Object.fromEntries(resp.headers)); res.end(Buffer.from(await resp.arrayBuffer()));
    return;
  }
  let p = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!p.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); }
  catch { p = join(DIST, '404.html'); res.statusCode = 404; }
  try { const data = await readFile(p); res.setHeader('Content-Type', TIPOS[extname(p)] || 'application/octet-stream'); res.end(data); }
  catch { res.writeHead(404); res.end('404'); }
}).listen(4321, () => console.log('http://localhost:4321'));
