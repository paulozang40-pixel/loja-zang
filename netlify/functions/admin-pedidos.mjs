import { timingSafeEqual } from 'node:crypto';
import { buscar, listar, salvar } from '../../server/pedidos.mjs';
import { json, lerCorpo, tratarErro } from '../../server/util.mjs';

function autorizado(req) {
  const senha = process.env.ADMIN_SENHA || '';
  const enviada = req.headers.get('x-senha') || '';
  if (senha.length < 8) return false;
  const a = Buffer.from(senha), b = Buffer.from(enviada);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STATUS = ['aguardando_pagamento', 'em_analise', 'pago', 'enviado', 'entregue', 'cancelado', 'reembolsado'];

// Painel simples de pedidos: GET lista, POST atualiza status e rastreio.
export default async (req) => {
  if (!autorizado(req)) {
    await new Promise((r) => setTimeout(r, 600));
    return json({ erro: 'Senha incorreta.' }, 401);
  }
  try {
    if (req.method === 'GET') return json({ pedidos: await listar() });
    if (req.method === 'POST') {
      const { id, status, rastreio } = await lerCorpo(req);
      const p = await buscar(id);
      if (!p) return json({ erro: 'Pedido não encontrado.' }, 404);
      if (status) {
        if (!STATUS.includes(status)) return json({ erro: 'Status inválido.' }, 400);
        p.status = status;
        p.historico = [...(p.historico || []), { quando: new Date().toISOString(), status, por: 'painel' }];
      }
      if (typeof rastreio === 'string') p.rastreio = rastreio.trim().slice(0, 40) || null;
      await salvar(p);
      return json({ ok: true, pedido: p });
    }
    return json({ erro: 'Método não permitido.' }, 405);
  } catch (e) {
    return tratarErro(e);
  }
};

export const config = { path: '/api/admin/pedidos' };
