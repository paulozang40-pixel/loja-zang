import { montarItens } from '../../server/catalogo.mjs';
import { aplicarCupom } from '../../server/cupons.mjs';
import { json, lerCorpo, tratarErro } from '../../server/util.mjs';

// Confere um cupom para mostrar o desconto na página de finalizar a compra.
// O valor final é sempre recalculado de novo em /api/checkout.
export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  try {
    const corpo = await lerCorpo(req);
    const { linhas, subtotal } = montarItens(corpo.itens);
    const c = aplicarCupom(corpo.codigo, linhas, subtotal);
    if (!c) return json({ erro: 'Digite o código do cupom.' }, 422);
    return json({ codigo: c.codigo, percentual: c.percentual, descricao: c.descricao, desconto: c.desconto });
  } catch (e) {
    return tratarErro(e);
  }
};

export const config = { path: '/api/cupom' };
