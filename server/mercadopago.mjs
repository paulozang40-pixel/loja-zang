// Integração com o Mercado Pago (Checkout Pro)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErroPedido } from './catalogo.mjs';

const env = (k, d = '') => (globalThis.process?.env?.[k] ?? d);
const API = 'https://api.mercadopago.com';

function token() {
  const t = env('MP_ACCESS_TOKEN');
  if (!t) throw new ErroPedido('O pagamento ainda não foi configurado na loja.', 503);
  return t;
}

function separarTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length >= 10 ? { area_code: d.slice(0, 2), number: d.slice(2) } : undefined;
}

export async function criarPreferencia(pedido, siteUrl) {
  const c = pedido.cliente;
  const [nome, ...resto] = c.nome.trim().split(/\s+/);
  const voltar = (s) => `${siteUrl}/pedido/?id=${encodeURIComponent(pedido.id)}&r=${s}`;
  const body = {
    items: pedido.itens.map((l) => ({
      id: l.id,
      title: l.nome.slice(0, 250),
      quantity: l.qtd,
      unit_price: l.precoUnit,
      currency_id: 'BRL',
      ...(l.imagem ? { picture_url: `${siteUrl}${l.imagem}` } : {}),
    })),
    payer: {
      name: nome, surname: resto.join(' '), email: c.email,
      phone: separarTelefone(c.telefone),
      address: { zip_code: c.cep, street_name: c.endereco, street_number: c.numero },
    },
    shipments: {
      mode: 'not_specified',
      cost: pedido.frete.preco,
      receiver_address: { zip_code: c.cep, street_name: c.endereco, street_number: c.numero, apartment: c.complemento || undefined, city_name: c.cidade, state_name: c.uf },
    },
    back_urls: { success: voltar('ok'), pending: voltar('pendente'), failure: voltar('erro') },
    auto_return: 'approved',
    notification_url: `${siteUrl}/api/mp-webhook`,
    external_reference: pedido.id,
    statement_descriptor: 'ZANG EDITORA',
    metadata: { pedido: pedido.id },
  };
  const res = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': pedido.id },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.init_point) {
    console.error('MP preference', res.status, JSON.stringify(json).slice(0, 500));
    throw new ErroPedido('Não foi possível abrir o pagamento agora. Tente de novo em instantes.', 502);
  }
  const teste = token().startsWith('TEST-');
  return { id: json.id, url: teste && json.sandbox_init_point ? json.sandbox_init_point : json.init_point };
}

export async function buscarPagamento(id) {
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, { headers: { 'Authorization': `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`MP payment ${id}: ${res.status}`);
  return res.json();
}

/**
 * Confere a assinatura x-signature das notificações (Webhooks).
 * Modelo: id:[data.id];request-id:[x-request-id];ts:[ts];  com HMAC-SHA256 da chave secreta.
 * Sem chave configurada, a conferência é pulada (o status sempre é buscado direto na API).
 */
export function assinaturaValida({ xSignature, xRequestId, dataId }, segredo = env('MP_WEBHOOK_SECRET')) {
  if (!segredo) return true;
  if (!xSignature) return false;
  const partes = Object.fromEntries(String(xSignature).split(',').map((p) => p.trim().split('=').map((s) => s.trim())));
  const ts = partes.ts, v1 = partes.v1;
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(String(dataId || '')) ? String(dataId).toLowerCase() : String(dataId || '');
  let manifesto = '';
  if (id) manifesto += `id:${id};`;
  if (xRequestId) manifesto += `request-id:${xRequestId};`;
  manifesto += `ts:${ts};`;
  const esperado = createHmac('sha256', segredo).update(manifesto).digest('hex');
  const a = Buffer.from(esperado), b = Buffer.from(String(v1));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function statusDoPagamento(status) {
  switch (status) {
    case 'approved': return 'pago';
    case 'authorized':
    case 'in_process':
    case 'in_mediation': return 'em_analise';
    case 'pending': return 'aguardando_pagamento';
    case 'rejected':
    case 'cancelled': return 'cancelado';
    case 'refunded':
    case 'charged_back': return 'reembolsado';
    default: return null;
  }
}
