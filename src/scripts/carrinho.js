// Carrinho da loja: guardado no navegador, preços sempre recalculados no servidor.
const KEY = 'zang-carrinho-v1';
const CAT = JSON.parse(document.getElementById('catalogo-cliente')?.textContent || '{}');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s, el = document) => el.querySelector(s);

function ler() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    const itens = {};
    for (const [id, q] of Object.entries(d.itens || {})) if (CAT[id] && q > 0) itens[id] = Math.min(200, Math.floor(q));
    return { itens, cep: d.cep || '' };
  } catch { return { itens: {}, cep: '' }; }
}
let estado = ler();
function gravar(avisar = true) {
  try { localStorage.setItem(KEY, JSON.stringify(estado)); } catch { /* navegação privada */ }
  if (avisar) document.dispatchEvent(new CustomEvent('carrinho:mudou'));
}

export function precoUnit(id, qtd) {
  const v = CAT[id];
  let p = v.p;
  for (const [min, pr] of v.a || []) if (qtd >= min && pr < p) p = pr;
  return p;
}
export const itens = () => Object.entries(estado.itens).map(([id, qtd]) => ({ id, qtd, ...CAT[id], unit: precoUnit(id, qtd) }));
export const subtotal = () => itens().reduce((s, i) => s + Math.round(i.unit * i.qtd * 100) / 100, 0);
export const quantidade = () => Object.values(estado.itens).reduce((a, b) => a + b, 0);
export const cepSalvo = () => estado.cep;
export const paraServidor = () => itens().map((i) => ({ id: i.id, qtd: i.qtd }));
export function salvarCep(cep) { estado.cep = cep; gravar(false); }
export function limpar() { estado.itens = {}; gravar(); pintar(); }

export function adicionar(id, qtd = 1) {
  if (!CAT[id]) return;
  estado.itens[id] = Math.min(200, (estado.itens[id] || 0) + qtd);
  gravar(); pintar(true);
  toast('Adicionado ao carrinho', CAT[id].i);
}
function alterar(id, delta) {
  const q = (estado.itens[id] || 0) + delta;
  if (q <= 0) delete estado.itens[id]; else estado.itens[id] = Math.min(200, q);
  gravar(); pintar(delta > 0);
}

// ---------- interface
let tt = 0;
export function toast(msg, img) {
  const t = $('#toast'); if (!t) return;
  $('#toastMsg').textContent = msg;
  const im = t.querySelector('img');
  if (img) { im.src = img; im.hidden = false; t.querySelector('.ico').style.display = 'none'; }
  else { im.hidden = true; t.querySelector('.ico').style.display = ''; }
  t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600);
}

function pintarBadge(bump) {
  const b = $('#badge'); if (!b) return;
  const n = quantidade();
  b.textContent = n; b.hidden = n === 0;
  if (bump && !reduce) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}

function pintarGaveta() {
  const body = $('#dBody'); if (!body) return;
  const lista = itens();
  $('#dFoot').hidden = lista.length === 0;
  if (!lista.length) {
    body.innerHTML = `<div class="d-empty"><svg class="ico"><use href="#i-bag"/></svg><h3>Seu carrinho está vazio</h3><p>Escolha um livro, revista, hinário ou agenda para começar.</p><a class="btn btn-gold" href="/produtos/">Ver produtos</a></div>`;
  } else {
    body.innerHTML = lista.map((i) => `
      <div class="line-item">
        <div class="th"><img src="${esc(i.i)}" alt="" loading="lazy"></div>
        <div>
          <h3><a href="/produto/${esc(i.s)}/">${esc(i.n)}</a></h3>
          <div class="p">${brl(i.unit * i.qtd)}${i.qtd > 1 ? ` <small>(${brl(i.unit)} cada)</small>` : ''}</div>
          <div class="qty">
            <button type="button" data-dec="${esc(i.id)}" aria-label="Diminuir quantidade"><svg class="ico"><use href="#i-minus"/></svg></button>
            <span>${i.qtd}</span>
            <button type="button" data-inc="${esc(i.id)}" aria-label="Aumentar quantidade"><svg class="ico"><use href="#i-plus"/></svg></button>
          </div>
        </div>
        <button class="rm" type="button" data-rm="${esc(i.id)}" aria-label="Remover ${esc(i.n)}"><svg class="ico"><use href="#i-trash"/></svg></button>
      </div>`).join('');
  }
  $('#subtotal').textContent = brl(subtotal());
  const ship = $('#dShip'); if (ship) ship.hidden = true;
}

function pintar(bump) { pintarBadge(bump); pintarGaveta(); }

let ultimoFoco = null;
export function abrir() {
  ultimoFoco = document.activeElement; pintarGaveta();
  $('#drawer').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#overlay').classList.add('on');
  setTimeout(() => $('#closeCart')?.focus(), 60);
}
export function fechar() {
  $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#overlay').classList.remove('on');
  ultimoFoco?.focus?.();
}

export function mascaraCep(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    input.value = v;
  });
}

export async function cotarFrete(cep, lista = paraServidor()) {
  const r = await fetch('/api/frete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cep, itens: lista }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível calcular o frete agora.');
  return j.opcoes;
}

export function prazoTexto(o) {
  if (!o.prazoMax) return '';
  return o.prazoMin && o.prazoMin !== o.prazoMax ? `${o.prazoMin} a ${o.prazoMax} dias úteis` : `até ${o.prazoMax} dias úteis`;
}

export function htmlOpcoes(opcoes, nomeRadio) {
  return opcoes.map((o, n) => {
    const conteudo = `<span class="esq">${nomeRadio ? `<input type="radio" name="${nomeRadio}" value="${o.servico}" ${n === 0 ? 'checked' : ''}>` : ''}<span><b>${esc(o.nome)}</b><small>${prazoTexto(o)}</small></span></span><b>${brl(o.preco)}</b>`;
    return nomeRadio ? `<label class="ship">${conteudo}</label>` : `<div class="ship">${conteudo}</div>`;
  }).join('');
}

// ---------- eventos globais
document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { e.preventDefault(); adicionar(add.dataset.add, Number(add.dataset.qtd || 1)); }
  const inc = e.target.closest('[data-inc]'); if (inc) alterar(inc.dataset.inc, 1);
  const dec = e.target.closest('[data-dec]'); if (dec) alterar(dec.dataset.dec, -1);
  const rm = e.target.closest('[data-rm]'); if (rm) { delete estado.itens[rm.dataset.rm]; gravar(); pintar(); }
  if (e.target.closest('[data-abrir-carrinho]') && $('#drawer')) { e.preventDefault(); abrir(); }
  if (e.target.closest('[data-fechar-carrinho]')) fechar();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#drawer')?.classList.contains('on')) fechar(); });
window.addEventListener('storage', (e) => { if (e.key === KEY) { estado = ler(); pintar(); } });

// Frete na gaveta (só informativo; a escolha acontece ao finalizar)
const cep = $('#dCep');
if (cep) {
  mascaraCep(cep);
  cep.value = estado.cep ? estado.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : '';
  $('#dCalc').addEventListener('click', async () => {
    const v = cep.value.replace(/\D/g, ''); const msg = $('#dCepMsg'); const ship = $('#dShip');
    if (v.length !== 8) { msg.textContent = 'Digite os 8 números do CEP.'; msg.className = 'err'; cep.focus(); return; }
    msg.textContent = 'Os valores aparecem antes do pagamento.'; msg.className = 'hint';
    salvarCep(v);
    ship.hidden = false; ship.innerHTML = '<div class="skel" aria-label="Calculando frete"><i></i><i></i></div>';
    try { ship.innerHTML = `<div class="ship-list">${htmlOpcoes(await cotarFrete(v))}</div>`; }
    catch (err) { ship.innerHTML = `<div class="aviso erro">${esc(err.message)}</div>`; }
  });
}

pintar();
