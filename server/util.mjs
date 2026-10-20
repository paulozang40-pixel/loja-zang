import { ErroPedido } from './catalogo.mjs';

export const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

export function siteUrl(req) {
  const env = globalThis.process?.env || {};
  return (env.SITE_URL || env.URL || new URL(req.url).origin).replace(/\/$/, '');
}

export async function lerCorpo(req) {
  const txt = await req.text();
  if (txt.length > 50_000) throw new ErroPedido('Pedido grande demais.');
  try { return JSON.parse(txt || '{}'); } catch { throw new ErroPedido('Dados inválidos.'); }
}

export function tratarErro(e) {
  if (e instanceof ErroPedido) return json({ erro: e.message, ...(e.campos ? { campos: e.campos } : {}) }, e.status);
  console.error(e);
  return json({ erro: 'Algo deu errado do nosso lado. Tente de novo ou chame no WhatsApp (45) 99820-3263.' }, 500);
}

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

/** Valida e limpa os dados do cliente. */
export function validarCliente(c = {}) {
  const t = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const cliente = {
    nome: t(c.nome, 100), email: t(c.email, 120).toLowerCase(), telefone: t(c.telefone, 20),
    cep: String(c.cep ?? '').replace(/\D/g, ''), endereco: t(c.endereco), numero: t(c.numero, 20),
    complemento: t(c.complemento, 60), bairro: t(c.bairro, 80), cidade: t(c.cidade, 80), uf: t(c.uf, 2).toUpperCase(),
  };
  const erros = {};
  if (cliente.nome.split(' ').length < 2) erros.nome = 'Digite nome e sobrenome.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cliente.email)) erros.email = 'Digite um e-mail válido.';
  if (cliente.telefone.replace(/\D/g, '').length < 10) erros.telefone = 'Digite o telefone com DDD.';
  if (cliente.cep.length !== 8) erros.cep = 'Digite um CEP com 8 números.';
  if (!cliente.endereco) erros.endereco = 'Digite a rua.';
  if (!cliente.numero) erros.numero = 'Digite o número (ou S/N).';
  if (!cliente.bairro) erros.bairro = 'Digite o bairro.';
  if (!cliente.cidade) erros.cidade = 'Digite a cidade.';
  if (!UFS.includes(cliente.uf)) erros.uf = 'Escolha o estado.';
  if (Object.keys(erros).length) {
    const e = new ErroPedido('Confira os dados de entrega.');
    e.campos = erros;
    throw e;
  }
  return cliente;
}
