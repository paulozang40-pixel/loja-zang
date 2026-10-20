import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.PEDIDOS_MEMORIA = '1';
process.env.SUPERFRETE_TOKEN = 'sf-token-teste';
process.env.MP_ACCESS_TOKEN = 'APP_USR-teste';
process.env.MP_WEBHOOK_SECRET = 'segredo-teste';
process.env.SITE_URL = 'https://www.zangeditoracrista.com.br';
process.env.ADMIN_SENHA = 'senha-forte-123';

const { montarItens, precoUnitario, buscarVariante } = await import('../server/catalogo.mjs');
const { cotar, volumeUnico } = await import('../server/superfrete.mjs');
const { assinaturaValida, statusDoPagamento } = await import('../server/mercadopago.mjs');
const { validarCliente } = await import('../server/util.mjs');
const pedidos = await import('../server/pedidos.mjs');
const checkout = (await import('../netlify/functions/checkout.mjs')).default;
const webhook = (await import('../netlify/functions/mp-webhook.mjs')).default;
const frete = (await import('../netlify/functions/frete.mjs')).default;
const status = (await import('../netlify/functions/pedido-status.mjs')).default;
const admin = (await import('../netlify/functions/admin-pedidos.mjs')).default;

// ---- fetch simulado
let chamadas = [];
let respostaMP = {};
const RESPOSTA_SF = [
  { id: 1, name: 'PAC', price: '22.40', delivery_time: 7, delivery_range: { min: 6, max: 7 }, company: { name: 'Correios' } },
  { id: 2, name: 'SEDEX', price: 39.9, delivery_time: 3, company: { name: 'Correios' } },
  { id: 17, name: 'Mini Envios', error: 'Peso excede o limite' },
];
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  chamadas.push({ url, opt, body: opt.body ? (opt.headers?.['Content-Type']?.includes('json') ? JSON.parse(opt.body) : String(opt.body)) : null });
  const resp = (obj, st = 200) => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status: st });
  if (url.endsWith('/api/v0/calculator')) return resp(RESPOSTA_SF);
  if (url.endsWith('/api/v0/cart')) return resp({ id: 'SF123', status: 'pending' });
  if (url.endsWith('/checkout/preferences')) return resp({ id: 'PREF1', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=PREF1' });
  if (url.includes('/v1/payments/')) return resp(respostaMP);
  if (url.endsWith('/formularios/')) return resp('ok');
  return resp({ erro: 'nao mockado ' + url }, 404);
};
beforeEach(() => { chamadas = []; });

const CLIENTE = {
  nome: 'Maria da Silva', email: 'maria@exemplo.com.br', telefone: '(45) 99999-1234',
  cep: '85807-050', endereco: 'Rua Pernambuco', numero: '100', complemento: '', bairro: 'Aclimação', cidade: 'Cascavel', uf: 'pr',
};
const post = (url, body, headers = {}) => new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });

test('preço de atacado entra conforme a quantidade', () => {
  const { variante } = buscarVariante('mensagens-biblicas-vol-1');
  assert.equal(precoUnitario(variante, 1), 31.2);
  assert.equal(precoUnitario(variante, 3), 30);
  const { linhas, subtotal } = montarItens([{ id: 'mensagens-biblicas-vol-1', qtd: 2 }, { id: 'mensagens-biblicas-vol-1', qtd: 1 }]);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].qtd, 3);
  assert.equal(subtotal, 90);
});

test('itens inválidos são recusados', () => {
  assert.throws(() => montarItens([]), /vazio/);
  assert.throws(() => montarItens([{ id: 'nao-existe', qtd: 1 }]), /não está mais disponível/);
  assert.throws(() => montarItens([{ id: 'voce-sabia', qtd: 0 }]), /Quantidade/);
  assert.throws(() => montarItens([{ id: 'voce-sabia', qtd: 1.5 }]), /Quantidade/);
});

test('cotação da SuperFrete: filtra erros, soma prazo de postagem e ordena', async () => {
  const { linhas, subtotal } = montarItens([{ id: 'voce-sabia', qtd: 2 }]);
  const op = await cotar('20040-020', linhas, subtotal);
  assert.deepEqual(op.map((o) => o.nome), ['PAC', 'SEDEX']);
  assert.equal(op[0].preco, 22.4);
  assert.equal(op[0].prazoMin, 8);
  assert.equal(op[0].prazoMax, 9);
  const req = chamadas[0];
  assert.match(req.opt.headers.Authorization, /^Bearer sf-token-teste$/);
  assert.equal(req.body.from.postal_code, '85807050');
  assert.equal(req.body.to.postal_code, '20040020');
  assert.equal(req.body.products[0].quantity, 2);
  assert.ok(req.body.products[0].weight > 0);
});

test('volume único soma alturas e pesos', () => {
  const v = volumeUnico([{ qtd: 2, peso: 0.3, dims: { altura: 2, largura: 16, comprimento: 23 } }, { qtd: 1, peso: 0.5, dims: { altura: 3, largura: 18, comprimento: 22 } }]);
  assert.deepEqual(v, { height: 7, width: 18, length: 23, weight: 1.1 });
});

test('dados do cliente são validados', () => {
  assert.throws(() => validarCliente({ ...CLIENTE, nome: 'Maria' }), (e) => Boolean(e.campos?.nome));
  assert.throws(() => validarCliente({ ...CLIENTE, uf: 'XX' }), (e) => Boolean(e.campos?.uf));
  const c = validarCliente(CLIENTE);
  assert.equal(c.cep, '85807050');
  assert.equal(c.uf, 'PR');
});

test('frete: endpoint responde com opções', async () => {
  const r = await frete(post('https://x/api/frete', { cep: '20040020', itens: [{ id: 'a-realidade-do-inferno', qtd: 1 }] }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.opcoes.length, 2);
});

let idPedido;
test('checkout: preços e frete recalculados no servidor, preferência criada', async () => {
  const r = await checkout(post('https://x/api/checkout', {
    cliente: CLIENTE,
    itens: [{ id: 'a-realidade-do-inferno', qtd: 2, preco: 0.01 }, { id: 'hinos-antigos--luxo', qtd: 1 }],
    freteServico: 2,
  }));
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.match(j.url, /mercadopago/);
  idPedido = j.pedido;
  const p = await pedidos.buscar(idPedido);
  assert.equal(p.subtotal, 27.5 * 2 + 44.9); // atacado a partir de 2 unidades
  assert.equal(p.frete.preco, 39.9);
  assert.equal(p.total, Math.round((27.5 * 2 + 44.9 + 39.9) * 100) / 100);
  const pref = chamadas.find((c) => c.url.endsWith('/checkout/preferences')).body;
  assert.equal(pref.external_reference, idPedido);
  assert.equal(pref.shipments.cost, 39.9);
  assert.equal(pref.items[0].unit_price, 27.5);
  assert.equal(pref.notification_url, 'https://www.zangeditoracrista.com.br/api/mp-webhook');
  assert.equal(pref.payer.phone.area_code, '45');
});

test('checkout: frete escolhido que não existe é recusado', async () => {
  const r = await checkout(post('https://x/api/checkout', { cliente: CLIENTE, itens: [{ id: 'voce-sabia', qtd: 1 }], freteServico: 17 }));
  assert.equal(r.status, 409);
});

test('checkout: dados de entrega incompletos voltam com os campos', async () => {
  const r = await checkout(post('https://x/api/checkout', { cliente: { ...CLIENTE, numero: '' }, itens: [{ id: 'voce-sabia', qtd: 1 }], freteServico: 1 }));
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.ok(j.campos.numero);
});

function assinar(dataId, reqId, ts = '1742505638683') {
  const v1 = createHmac('sha256', 'segredo-teste').update(`id:${dataId};request-id:${reqId};ts:${ts};`).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

test('assinatura do webhook', () => {
  assert.equal(assinaturaValida({ xSignature: assinar('123', 'abc'), xRequestId: 'abc', dataId: '123' }), true);
  assert.equal(assinaturaValida({ xSignature: assinar('123', 'abc'), xRequestId: 'abc', dataId: '999' }), false);
  assert.equal(assinaturaValida({ xSignature: null, xRequestId: 'abc', dataId: '123' }), false);
  assert.equal(statusDoPagamento('approved'), 'pago');
});

test('webhook: assinatura errada é recusada', async () => {
  const r = await webhook(new Request('https://x/api/mp-webhook?data.id=555&type=payment', {
    method: 'POST', body: JSON.stringify({ type: 'payment', data: { id: '555' } }),
    headers: { 'x-signature': 'ts=1,v1=errado', 'x-request-id': 'r1' },
  }));
  assert.equal(r.status, 401);
});

test('webhook: pagamento aprovado marca como pago, avisa e manda para a SuperFrete', async () => {
  const p0 = await pedidos.buscar(idPedido);
  respostaMP = { id: 555, status: 'approved', external_reference: idPedido, transaction_amount: p0.total, payment_method_id: 'pix' };
  const req = () => new Request('https://x/api/mp-webhook?data.id=555&type=payment', {
    method: 'POST', body: JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: '555' } }),
    headers: { 'x-signature': assinar('555', 'r1'), 'x-request-id': 'r1' },
  });
  const r = await webhook(req());
  assert.equal(r.status, 200);
  const p = await pedidos.buscar(idPedido);
  assert.equal(p.status, 'pago');
  assert.equal(p.avisado, true);
  assert.equal(p.superfrete.id, 'SF123');
  const cart = chamadas.find((c) => c.url.endsWith('/api/v0/cart')).body;
  assert.equal(cart.to.postal_code, '85807050');
  assert.equal(cart.service, 2);
  assert.equal(cart.products.length, 2);
  const form = chamadas.find((c) => c.url.endsWith('/formularios/')).body;
  assert.match(form, /form-name=pedido-pago/);

  // notificação repetida não duplica aviso nem envio
  chamadas = [];
  await webhook(req());
  assert.equal(chamadas.filter((c) => c.url.endsWith('/api/v0/cart')).length, 0);
  assert.equal(chamadas.filter((c) => c.url.endsWith('/formularios/')).length, 0);
});

test('status público não expõe dados pessoais', async () => {
  const r = await status(new Request(`https://x/api/pedido?id=${idPedido}`));
  const j = await r.json();
  assert.equal(j.status, 'pago');
  assert.equal(j.cliente, undefined);
  assert.ok(!JSON.stringify(j).includes('maria@'));
});

test('painel de pedidos exige senha', async () => {
  assert.equal((await admin(new Request('https://x/api/admin/pedidos', { headers: { 'x-senha': 'errada' } }))).status, 401);
  const r = await admin(new Request('https://x/api/admin/pedidos', { headers: { 'x-senha': 'senha-forte-123' } }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.pedidos[0].id, idPedido);
  const r2 = await admin(new Request('https://x/api/admin/pedidos', { method: 'POST', headers: { 'x-senha': 'senha-forte-123' }, body: JSON.stringify({ id: idPedido, status: 'enviado', rastreio: 'AB123456789BR' }) }));
  assert.equal((await r2.json()).pedido.rastreio, 'AB123456789BR');
});

test('status mostra só se as chaves existem, nunca o valor', async () => {
  const st = (await import('../netlify/functions/status.mjs')).default;
  const j = await (await st(new Request('https://x/api/status'))).json();
  assert.equal(j.mercadoPago.configurado, true);
  assert.equal(j.superFrete.configurado, true);
  assert.equal(j.painel.senhaConfigurada, true);
  const txt = JSON.stringify(j);
  assert.ok(!txt.includes('APP_USR-teste') && !txt.includes('sf-token-teste') && !txt.includes('senha-forte-123'));
});
