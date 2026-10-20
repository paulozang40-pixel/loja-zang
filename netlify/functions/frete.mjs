import { montarItens } from '../../server/catalogo.mjs';
import { cotar, limparCep } from '../../server/superfrete.mjs';
import { json, lerCorpo, tratarErro } from '../../server/util.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  try {
    const { cep, itens } = await lerCorpo(req);
    const destino = limparCep(cep);
    const { linhas, subtotal } = montarItens(itens);
    const opcoes = await cotar(destino, linhas, subtotal);
    if (!opcoes.length) return json({ erro: 'Não encontramos opções de entrega para esse CEP. Confira o número ou chame no WhatsApp.' }, 422);
    return json({ cep: destino, opcoes });
  } catch (e) {
    return tratarErro(e);
  }
};

export const config = { path: '/api/frete' };
