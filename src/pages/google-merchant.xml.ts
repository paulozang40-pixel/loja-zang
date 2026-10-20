// Feed de produtos para o Google Merchant Center (aba Shopping gratuita).
import type { APIRoute } from 'astro';
import { LOJA, produtos, nomeCategoria } from '../lib/loja';

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CATEGORIA_GOOGLE: Record<string, string> = {
  livros: 'Media > Books', pregacao: 'Media > Books', ebd: 'Media > Books', hinarios: 'Media > Books', kits: 'Media > Books',
  agendas: 'Office Supplies > General Office Supplies > Paper Products > Calendars, Organizers & Planners',
};

export const GET: APIRoute = () => {
  const itens = produtos.flatMap((p) => p.variantes.map((v) => {
    const key = v.id.split('--')[1];
    const link = `${LOJA.url}/produto/${p.slug}/${key ? `?v=${key}` : ''}`;
    const titulo = v.nome ? `${p.nome} - ${v.nome}` : p.nome;
    const desc = [p.subtitulo ? p.subtitulo.replace(/[.!?]?$/, '.') : '', ...p.descricao].filter(Boolean).join(' ').slice(0, 4900);
    return `<item>
<g:id>${x(v.id)}</g:id>
<g:title>${x(titulo.slice(0, 150))}</g:title>
<g:description>${x(desc)}</g:description>
<g:link>${x(link)}</g:link>
<g:image_link>${x(LOJA.url + v.imagens[0].src)}</g:image_link>
<g:availability>in_stock</g:availability>
<g:price>${v.preco.toFixed(2)} BRL</g:price>
<g:condition>new</g:condition>
<g:brand>${x(LOJA.nome)}</g:brand>
${v.gtin ? `<g:gtin>${v.gtin}</g:gtin>` : '<g:identifier_exists>no</g:identifier_exists>'}
<g:item_group_id>${x(p.slug)}</g:item_group_id>
<g:google_product_category>${x(CATEGORIA_GOOGLE[p.categoria])}</g:google_product_category>
<g:product_type>${x(nomeCategoria(p.categoria))}</g:product_type>
<g:shipping_weight>${v.peso} kg</g:shipping_weight>
</item>`;
  }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${x(LOJA.nome)}</title>
<link>${LOJA.url}</link>
<description>Livros, revistas de EBD, hinários e agendas cristãs</description>
${itens.join('\n')}
</channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
