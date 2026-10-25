import { montarItens, ErroPedido } from '../../server/catalogo.mjs';
import { cotar } from '../../server/superfrete.mjs';
import { aplicarCupom } from '../../server/cupons.mjs';
import { criarPreferencia } from '../../server/mercadopago.mjs';
import { novoId, salvar } from '../../server/pedidos.mjs';
import { json, lerCorpo, siteUrl, tratarErro, validarCliente } from '../../server/util.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  try {
    const corpo = await lerCorpo(req);
    const cliente = validarCliente(corpo.cliente);
    const { linhas, subtotal } = montarItens(corpo.itens);

    // O frete é recalculado aqui para não confiar no valor vindo do navegador
    const opcoes = await cotar(cliente.cep, linhas, subtotal);
    const frete = opcoes.find((o) => o.servico === Number(corpo.freteServico));
    if (!frete) throw new ErroPedido('A opção de frete escolhida não está mais disponível. Calcule o frete de novo.', 409);

    // Cupom: o desconto também é recalculado aqui
    const cupom = aplicarCupom(corpo.cupom, linhas, subtotal);
    const itens = cupom ? cupom.linhas : linhas;
    const produtos = cupom ? cupom.subtotal : subtotal;

    const total = Math.round((produtos + frete.preco) * 100) / 100;
    const pedido = {
      id: novoId(),
      criadoEm: new Date().toISOString(),
      status: 'aguardando_pagamento',
      itens,
      subtotal,
      ...(cupom ? { cupom: { codigo: cupom.codigo, percentual: cupom.percentual, desconto: cupom.desconto } } : {}),
      frete,
      total,
      cliente,
      historico: [{ quando: new Date().toISOString(), status: 'aguardando_pagamento' }],
    };
    await salvar(pedido);

    const pref = await criarPreferencia(pedido, siteUrl(req));
    pedido.mpPreferencia = pref.id;
    await salvar(pedido);
    return json({ pedido: pedido.id, url: pref.url });
  } catch (e) {
    return tratarErro(e);
  }
};

export const config = { path: '/api/checkout' };
