// Catálogo no servidor: os preços SEMPRE vêm daqui, nunca do navegador.
import data from '../src/data/produtos.json' with { type: 'json' };

const variantes = new Map();
for (const p of data.produtos) {
  for (const v of p.variantes) variantes.set(v.id, { produto: p, variante: v });
}

export function buscarVariante(id) {
  return variantes.get(String(id)) || null;
}

/** Preço unitário considerando o preço de atacado pela quantidade. */
export function precoUnitario(variante, qtd) {
  let preco = variante.preco;
  for (const t of variante.atacado || []) {
    if (qtd >= t.min && t.preco < preco) preco = t.preco;
  }
  return preco;
}

export function nomeCompleto(produto, variante) {
  return variante.nome ? `${produto.nome} (${variante.nome})` : produto.nome;
}

const centavos = (n) => Math.round(n * 100) / 100;

/**
 * Valida os itens enviados pelo navegador e recalcula tudo no servidor.
 * itens: [{ id, qtd }]
 */
export function montarItens(itens) {
  if (!Array.isArray(itens) || itens.length === 0) throw new ErroPedido('O carrinho está vazio.');
  if (itens.length > 60) throw new ErroPedido('Carrinho com itens demais.');
  const somados = new Map();
  for (const it of itens) {
    const qtd = Number(it?.qtd);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 200) throw new ErroPedido('Quantidade inválida no carrinho.');
    if (!buscarVariante(it?.id)) throw new ErroPedido('Um dos produtos do carrinho não está mais disponível. Atualize a página.');
    somados.set(it.id, (somados.get(it.id) || 0) + qtd);
  }
  const linhas = [];
  for (const [id, qtd] of somados) {
    const { produto, variante } = buscarVariante(id);
    const unit = precoUnitario(variante, qtd);
    linhas.push({
      id, qtd, nome: nomeCompleto(produto, variante), slug: produto.slug,
      precoUnit: unit, subtotal: centavos(unit * qtd),
      peso: variante.peso, dims: variante.dims,
      imagem: variante.imagens?.[0]?.thumb || null,
    });
  }
  const subtotal = centavos(linhas.reduce((s, l) => s + l.subtotal, 0));
  return { linhas, subtotal };
}

export class ErroPedido extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}
