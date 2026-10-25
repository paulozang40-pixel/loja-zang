// Cupons de desconto da loja.
// Para criar, mudar ou encerrar um cupom, edite a lista abaixo e publique.
//   percentual : desconto sobre os produtos (o frete não tem desconto)
//   minimo     : valor mínimo em produtos para o cupom valer
//   validoAte  : último dia em que o cupom vale (AAAA-MM-DD), ou null para sem prazo
//   ativo      : false desliga o cupom
import { ErroPedido } from './catalogo.mjs';

export const CUPONS = {
  LANCAMENTO15: { percentual: 15, minimo: 50, validoAte: null, ativo: true, descricao: 'Lançamento do site: 15% de desconto' },
};

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const r2 = (n) => Math.round(n * 100) / 100;

export function normalizarCodigo(c) {
  return String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 30);
}

function hojeBrasil(agora) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Aplica o cupom às linhas do pedido. O desconto é distribuído no preço de cada unidade
 * (arredondado em centavos), assim o total enviado ao Mercado Pago bate exatamente.
 * Devolve null quando não há código.
 */
export function aplicarCupom(codigo, linhas, subtotal, agora = new Date()) {
  const cod = normalizarCodigo(codigo);
  if (!cod) return null;
  const c = CUPONS[cod];
  if (!c || !c.ativo || (c.validoAte && hojeBrasil(agora) > c.validoAte)) {
    throw new ErroPedido('Cupom inválido ou encerrado.', 422);
  }
  if (subtotal < c.minimo) {
    throw new ErroPedido(`O cupom ${cod} vale para compras a partir de ${brl(c.minimo)} em produtos. Faltam ${brl(r2(c.minimo - subtotal))}.`, 422);
  }
  const fator = 1 - c.percentual / 100;
  const novas = linhas.map((l) => {
    const precoUnit = r2(l.precoUnit * fator);
    return { ...l, precoOriginal: l.precoUnit, precoUnit, subtotal: r2(precoUnit * l.qtd) };
  });
  const novoSubtotal = r2(novas.reduce((s, l) => s + l.subtotal, 0));
  return { codigo: cod, percentual: c.percentual, descricao: c.descricao, desconto: r2(subtotal - novoSubtotal), linhas: novas, subtotal: novoSubtotal };
}
