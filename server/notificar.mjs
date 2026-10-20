// Aviso de pedido pago: envia um formulário do Netlify Forms, que manda
// e-mail para o dono do site (configurado em Netlify > Forms > Notificações).
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function resumoPedido(p) {
  const c = p.cliente;
  const itens = p.itens.map((l) => `${l.qtd}x ${l.nome} = ${brl(l.subtotal)}`).join('\n');
  return [
    `Pedido ${p.id} PAGO`,
    '',
    itens,
    `Frete (${p.frete.nome}): ${brl(p.frete.preco)}`,
    `Total: ${brl(p.total)}`,
    '',
    'Entregar para:',
    c.nome,
    `${c.endereco}, ${c.numero}${c.complemento ? ' - ' + c.complemento : ''}`,
    `${c.bairro} - ${c.cidade}/${c.uf} - CEP ${c.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}`,
    `WhatsApp: ${c.telefone}  E-mail: ${c.email}`,
  ].join('\n');
}

export async function avisarPedidoPago(pedido, siteUrl) {
  const corpo = new URLSearchParams({
    'form-name': 'pedido-pago',
    pedido: pedido.id,
    total: brl(pedido.total),
    cliente: pedido.cliente.nome,
    whatsapp: pedido.cliente.telefone,
    email: pedido.cliente.email,
    resumo: resumoPedido(pedido),
  });
  const res = await fetch(`${siteUrl}/formularios/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });
  if (!res.ok) throw new Error(`Netlify Forms ${res.status}`);
}
