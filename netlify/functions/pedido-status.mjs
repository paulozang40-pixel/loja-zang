import { buscar } from '../../server/pedidos.mjs';
import { json } from '../../server/util.mjs';

// Status público do pedido (sem dados pessoais), usado na página de retorno.
export default async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  const p = await buscar(id);
  if (!p) return json({ erro: 'Pedido não encontrado.' }, 404);
  return json({
    id: p.id,
    status: p.status,
    criadoEm: p.criadoEm,
    itens: p.itens.map((l) => ({ nome: l.nome, qtd: l.qtd, subtotal: l.subtotal })),
    frete: { nome: p.frete.nome, preco: p.frete.preco, prazoMin: p.frete.prazoMin, prazoMax: p.frete.prazoMax },
    total: p.total,
    rastreio: p.rastreio || null,
  });
};

export const config = { path: '/api/pedido' };
