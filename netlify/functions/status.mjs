import { json } from '../../server/util.mjs';

// Mostra se cada chave está configurada no Netlify (nunca mostra o valor).
// /api/status            -> só diz se existe
// /api/status?testar=1   -> também confere se a SuperFrete e o Mercado Pago aceitam a chave
const env = (k) => process.env[k] || '';

async function aceita(url, token) {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Loja Zang Editora Crista 1.0 (paulozang40@gmail.com)' } });
    return r.ok;
  } catch { return false; }
}

export default async (req) => {
  const testar = new URL(req.url).searchParams.get('testar') === '1';
  const mp = env('MP_ACCESS_TOKEN'), sf = env('SUPERFRETE_TOKEN');
  const out = {
    site: env('URL') || null,
    mercadoPago: { configurado: Boolean(mp), tipo: mp ? (mp.startsWith('TEST-') ? 'teste' : 'produção') : null },
    assinaturaWebhook: { configurado: Boolean(env('MP_WEBHOOK_SECRET')) },
    superFrete: { configurado: Boolean(sf), ambiente: env('SUPERFRETE_AMBIENTE') === 'sandbox' ? 'testes' : 'produção', enviarCarrinho: (env('SUPERFRETE_ENVIAR_CARRINHO') || 'sim') === 'sim' },
    painel: { senhaConfigurada: env('ADMIN_SENHA').length >= 8 },
  };
  if (testar) {
    if (mp) out.mercadoPago.chaveAceita = await aceita('https://api.mercadopago.com/users/me', mp);
    if (sf) out.superFrete.chaveAceita = await aceita(`${env('SUPERFRETE_AMBIENTE') === 'sandbox' ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com'}/api/v0/user`, sf);
  }
  return json(out);
};

export const config = { path: '/api/status' };
