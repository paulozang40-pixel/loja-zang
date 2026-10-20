import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => new Response(
  `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /finalizar/
Disallow: /pedido/
Disallow: /formularios/
Disallow: /api/

Sitemap: ${new URL('sitemap-index.xml', site).href}
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
