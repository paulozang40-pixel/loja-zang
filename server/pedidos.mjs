// Armazenamento dos pedidos no Netlify Blobs (ou em memória nos testes)
import { randomBytes } from 'node:crypto';

const memoria = new Map();
let storePromise = null;

async function store() {
  if (globalThis.process?.env?.PEDIDOS_MEMORIA === '1') {
    return {
      get: async (k) => memoria.get(k) ?? null,
      setJSON: async (k, v) => { memoria.set(k, structuredClone(v)); },
      list: async () => ({ blobs: [...memoria.keys()].map((key) => ({ key })) }),
    };
  }
  if (!storePromise) {
    storePromise = import('@netlify/blobs').then(({ getStore }) => getStore({ name: 'pedidos', consistency: 'strong' }));
  }
  return storePromise;
}

export function novoId(agora = new Date()) {
  const d = agora.toISOString().slice(0, 10).replace(/-/g, '');
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = [...randomBytes(5)].map((b) => alfabeto[b % alfabeto.length]).join('');
  return `Z${d}-${r}`;
}

export async function salvar(pedido) {
  pedido.atualizadoEm = new Date().toISOString();
  await (await store()).setJSON(pedido.id, pedido);
  return pedido;
}

export async function buscar(id) {
  if (!/^Z\d{8}-[A-Z0-9]{5}$/.test(String(id || ''))) return null;
  const s = await store();
  const v = await s.get(id, { type: 'json' });
  return typeof v === 'string' ? JSON.parse(v) : v;
}

export async function listar(limite = 300) {
  const s = await store();
  const { blobs } = await s.list();
  const chaves = blobs.map((b) => b.key).sort().reverse().slice(0, limite);
  const out = [];
  for (const k of chaves) {
    const p = await buscar(k);
    if (p) out.push(p);
  }
  return out.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
}
