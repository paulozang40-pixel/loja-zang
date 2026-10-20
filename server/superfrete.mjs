// Integração com a API da SuperFrete (https://superfrete.readme.io)
import { ErroPedido } from './catalogo.mjs';

const env = (k, d = '') => (globalThis.process?.env?.[k] ?? d);
const base = () => (env('SUPERFRETE_AMBIENTE') === 'sandbox' ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com');
export const CEP_ORIGEM = () => env('CEP_ORIGEM', '85807050').replace(/\D/g, '');

// Postagem em até 2 dias úteis depois do pagamento (somado ao prazo da transportadora)
export const DIAS_POSTAGEM = 2;

const NOMES = { 1: 'PAC', 2: 'SEDEX', 3: 'Jadlog', 17: 'Mini Envios', 31: 'Loggi' };

function headers() {
  const token = env('SUPERFRETE_TOKEN');
  if (!token) throw new ErroPedido('O cálculo de frete ainda não foi configurado na loja.', 503);
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': `Loja Zang Editora Crista 1.0 (${env('LOJA_EMAIL', 'paulozang40@gmail.com')})`,
  };
}

export function limparCep(cep) {
  const c = String(cep || '').replace(/\D/g, '');
  if (c.length !== 8) throw new ErroPedido('Digite um CEP com 8 números.');
  return c;
}

/** Cota o frete para as linhas do pedido. Retorna opções ordenadas pelo preço. */
export async function cotar(cepDestino, linhas, valorDeclarado) {
  const to = limparCep(cepDestino);
  const body = {
    from: { postal_code: CEP_ORIGEM() },
    to: { postal_code: to },
    services: env('SUPERFRETE_SERVICOS', '1,2,17'),
    options: { own_hand: false, receipt: false, insurance_value: Number(valorDeclarado) || 0, use_insurance_value: false },
    products: linhas.map((l) => ({
      quantity: l.qtd,
      height: l.dims.altura, width: l.dims.largura, length: l.dims.comprimento,
      weight: l.peso,
    })),
  };
  const res = await fetch(`${base()}/api/v0/calculator`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const txt = await res.text();
  if (!res.ok) {
    console.error('SuperFrete calculator', res.status, txt.slice(0, 500));
    throw new ErroPedido('Não foi possível calcular o frete agora. Tente de novo em instantes.', 502);
  }
  let json;
  try { json = JSON.parse(txt); } catch { throw new ErroPedido('Resposta inválida do cálculo de frete.', 502); }
  const lista = Array.isArray(json) ? json : (json.data || json.services || []);
  return lista
    .filter((s) => !s.error && !s.has_error && Number(s.price) > 0)
    .map((s) => {
      const min = Number(s.delivery_range?.min ?? s.delivery_time);
      const max = Number(s.delivery_range?.max ?? s.delivery_time);
      return {
        servico: Number(s.id),
        nome: NOMES[s.id] || s.name,
        transportadora: s.company?.name || null,
        preco: Math.round(Number(s.price) * 100) / 100,
        prazoMin: Number.isFinite(min) ? min + DIAS_POSTAGEM : null,
        prazoMax: Number.isFinite(max) ? max + DIAS_POSTAGEM : null,
      };
    })
    .sort((a, b) => a.preco - b.preco);
}

/** Junta os itens em um volume só para a etiqueta (a SuperFrete ajusta o mínimo). */
export function volumeUnico(linhas) {
  let comprimento = 0, largura = 0, altura = 0, peso = 0;
  for (const l of linhas) {
    comprimento = Math.max(comprimento, l.dims.comprimento);
    largura = Math.max(largura, l.dims.largura);
    altura += l.dims.altura * l.qtd;
    peso += l.peso * l.qtd;
  }
  return { height: Math.min(Math.max(altura, 2), 100), width: largura, length: comprimento, weight: Math.round(peso * 1000) / 1000 };
}

/** Coloca o envio do pedido pago no carrinho da SuperFrete (não compra a etiqueta). */
export async function adicionarAoCarrinho(pedido) {
  const c = pedido.cliente;
  const body = {
    from: {
      name: env('REMETENTE_NOME', 'Zang Editora Cristã'),
      address: env('REMETENTE_RUA', 'Rua Pernambuco'),
      number: env('REMETENTE_NUMERO', '3256'),
      district: env('REMETENTE_BAIRRO', 'Aclimação'),
      city: env('REMETENTE_CIDADE', 'Cascavel'),
      state_abbr: env('REMETENTE_UF', 'PR'),
      postal_code: CEP_ORIGEM(),
    },
    to: {
      name: c.nome, address: c.endereco, number: c.numero, complement: c.complemento || '',
      district: c.bairro, city: c.cidade, state_abbr: c.uf, postal_code: c.cep, email: c.email,
    },
    service: pedido.frete.servico,
    products: pedido.itens.map((l) => ({ name: l.nome.slice(0, 100), quantity: String(l.qtd), unitary_value: l.precoUnit.toFixed(2) })),
    volumes: volumeUnico(pedido.itens),
    options: { insurance_value: null, receipt: false, own_hand: false, non_commercial: true, tags: [{ tag: pedido.id }] },
    platform: 'Loja Zang Editora Cristã',
  };
  const res = await fetch(`${base()}/api/v0/cart`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`SuperFrete cart ${res.status}: ${txt.slice(0, 300)}`);
  try { return JSON.parse(txt); } catch { return { ok: true }; }
}
