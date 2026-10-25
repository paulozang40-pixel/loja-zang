import data from '../data/produtos.json';

export type Imagem = { src: string; thumb: string; w: number; h: number; fundo: 'transparente' | 'branco' | 'foto' };
export type Variante = {
  id: string; nome: string | null; preco: number; atacado: { min: number; preco: number }[];
  peso: number; dims: { altura: number; largura: number; comprimento: number }; gtin: string | null; imagens: Imagem[];
};
export type Produto = {
  slug: string; nome: string; categoria: string; subtitulo?: string; descricao: string[]; ficha: [string, string][];
  novo: boolean; destaque: boolean; variantes: Variante[]; extras: Imagem[]; precoMin: number; precoMax: number;
};

export const LOJA = {
  nome: 'Zang Editora Cristã',
  url: 'https://www.zangeditoracrista.com.br',
  whatsapp: '5545998203263',
  whatsappTexto: '(45) 99820-3263',
  email: 'paulozang40@gmail.com',
  cnpj: '11.754.761/0001-55',
  endereco: 'Rua Pernambuco, 3256, Bairro Aclimação, Cascavel/PR, CEP 85807-050',
  shopee: 'https://shopee.com.br/zang1editora',
  mercadoLivre: 'https://lista.mercadolivre.com.br/_CustId_2956348575',
  tiktok: 'https://vt.tiktok.com/ZSgAAmDg6/?page=TikTokShop',
  diasPostagem: 2,
};

export const produtos = data.produtos as Produto[];
export const categorias = data.categorias as { id: string; nome: string }[];
export const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome ?? id;
export const porSlug = (slug: string) => produtos.find((p) => p.slug === slug);
export const daCategoria = (id: string) => produtos.filter((p) => p.categoria === id);

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const urlProduto = (p: Produto) => `/produto/${p.slug}/`;
export const urlCategoria = (id: string) => `/categoria/${id}/`;
export const imagemPrincipal = (p: Produto) => p.variantes[0].imagens[0];

export function textoPreco(p: Produto) {
  return p.precoMin === p.precoMax ? brl(p.precoMin) : `a partir de ${brl(p.precoMin)}`;
}

export function resumo(p: Produto, max = 155) {
  const t = [p.subtitulo, p.descricao[0]].filter(Boolean).join('. ').replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

export const wa = (texto: string) => `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(texto)}`;

/** Catálogo enxuto que vai para o navegador (carrinho). */
export function catalogoCliente() {
  const out: Record<string, unknown> = {};
  for (const p of produtos) {
    for (const v of p.variantes) {
      out[v.id] = {
        n: v.nome ? `${p.nome} (${v.nome})` : p.nome,
        s: p.slug, p: v.preco, a: v.atacado.map((t) => [t.min, t.preco]),
        i: v.imagens[0]?.thumb, f: v.imagens[0]?.fundo,
      };
    }
  }
  return out;
}

// Faixa no topo do site anunciando um cupom. Para tirar, troque por: null
export const AVISO_CUPOM: { texto: string; codigo: string } | null = {
  texto: 'Lançamento do site: 15% de desconto em compras a partir de R$ 50 com o cupom',
  codigo: 'LANCAMENTO15',
};
