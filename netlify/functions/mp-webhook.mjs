import { assinaturaValida, buscarPagamento, statusDoPagamento } from '../../server/mercadopago.mjs';
import { buscar, salvar, reservar } from '../../server/pedidos.mjs';
import { adicionarAoCarrinho } from '../../server/superfrete.mjs';
import { avisarPedidoPago } from '../../server/notificar.mjs';
import { json, siteUrl } from '../../server/util.mjs';

// Recebe as notificações do Mercado Pago e atualiza o pedido.
export default async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const url = new URL(req.url);
  let corpo = {};
  try { corpo = JSON.parse((await req.text()) || '{}'); } catch { /* notificação sem corpo */ }

  const tipo = corpo.type || corpo.topic || url.searchParams.get('type') || url.searchParams.get('topic');
  const dataId = url.searchParams.get('data.id') || corpo?.data?.id || url.searchParams.get('id');
  if (tipo !== 'payment' || !dataId) return json({ ok: true, ignorado: true });

  if (!assinaturaValida({ xSignature: req.headers.get('x-signature'), xRequestId: req.headers.get('x-request-id'), dataId })) {
    return json({ erro: 'assinatura inválida' }, 401);
  }

  try {
    const pg = await buscarPagamento(dataId);
    const pedido = await buscar(pg.external_reference);
    if (!pedido) return json({ ok: true, semPedido: true });

    const novo = statusDoPagamento(pg.status);
    if (novo && novo !== pedido.status && !(pedido.status === 'enviado' && novo === 'pago')) {
      pedido.status = novo;
      pedido.historico = [...(pedido.historico || []), { quando: new Date().toISOString(), status: novo, pagamento: String(pg.id) }];
    }
    pedido.pagamento = { id: String(pg.id), status: pg.status, metodo: pg.payment_method_id, valor: pg.transaction_amount };

    // Confere se o valor pago bate com o total do pedido
    if (pg.status === 'approved' && Math.abs(Number(pg.transaction_amount) - pedido.total) > 0.05) {
      pedido.alerta = `Valor pago (${pg.transaction_amount}) diferente do total do pedido (${pedido.total}). Confira antes de enviar.`;
    }

    if (pedido.status === 'pago') {
      const site = siteUrl(req);
      // reservar() só deixa passar a primeira notificação de cada pedido
      if (!pedido.avisado && await reservar(`${pedido.id}-aviso`)) {
        try { await avisarPedidoPago(pedido, site); pedido.avisado = true; }
        catch (e) { console.error('aviso por e-mail', e.message); }
      }
      if (!pedido.superfrete && (process.env.SUPERFRETE_ENVIAR_CARRINHO ?? 'sim') === 'sim' && !pedido.alerta
          && await reservar(`${pedido.id}-superfrete`)) {
        try { pedido.superfrete = await adicionarAoCarrinho(pedido); }
        catch (e) { console.error('carrinho SuperFrete', e.message); pedido.superfreteErro = e.message.slice(0, 300); }
      }
    }
    // Junta com o que outra notificação simultânea possa ter gravado
    const atual = await buscar(pedido.id);
    if (atual) {
      for (const k of ['avisado', 'superfrete', 'superfreteErro', 'rastreio']) if (atual[k] && !pedido[k]) pedido[k] = atual[k];
      if (['enviado', 'entregue'].includes(atual.status)) pedido.status = atual.status;
    }
    await salvar(pedido);
    return json({ ok: true });
  } catch (e) {
    console.error('webhook', e);
    // 500 faz o Mercado Pago tentar de novo mais tarde
    return json({ erro: 'falha temporária' }, 500);
  }
};

export const config = { path: '/api/mp-webhook' };
