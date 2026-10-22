import { LOGO_URL, MAPA_OFICIAL_URL, ADMIN_NOME, FIREBASE_CONFIG, PIN_DIGITOS, ESCOLA_NOME, PROFESSORES_EXTRAS } from './config.js';
import { criarStore, carregarArquivoBase } from './dados.js';
import {
  normalizar, esc, icone, agora, sincronizarRelogio, relogioConfiavel, dataISO, horaHHMM, dataBR, dataHoraBR,
  bahiaParaMs, somarDiasISO, periodoDe, cronometro, rotuloDiaEvento, inteiroOuNulo, resumoGrupos, totalGrupos, partes, diaSemana,
} from './util.js';

const store = criarStore();
const $app = document.getElementById('app');
const $alertas = document.getElementById('alertas');
const $modal = document.getElementById('camada-modal');

const E = {
  ambiente: 'guias', aba: 'alunos', abaAdmin: 'onibus',
  base: null, baseErro: null, indice: [], apsPorAluno: new Map(), alunoPorId: new Map(),
  visitas: [], mapa: null, datas: null, auditoria: [],
  busca: '', fichaId: null,
  hist: { busca: '', filtro: 'todos', excluidos: false },
  datasRascunho: null,
};

const icones = () => { try { window.lucide?.createIcons({ attrs: { 'stroke-width': 2 } }); } catch { /* ícones são opcionais */ } };

function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms);
}

// ════════════════════ BASE DE ESTUDANTES ════════════════════
function montarIndice(base) {
  E.alunoPorId = new Map(base.students.map((s) => [s.id, s]));
  E.apsPorAluno = new Map();
  for (const p of base.presentations) {
    if (!E.apsPorAluno.has(p.studentId)) E.apsPorAluno.set(p.studentId, []);
    E.apsPorAluno.get(p.studentId).push(p);
  }
  E.indice = base.students.map((s) => ({ s, busca: s.busca || normalizar([s.nome, ...(s.aliases || [])].join(' ')) }));
  E.professores = montarProfessores(base.presentations);
}

// ── Professores: extraídos do campo "responsáveis" das apresentações + extras do mapa oficial ──
// Grafias diferentes do mesmo professor nas fontes (ex.: Carol / Carolina) viram uma pessoa só.
const APELIDOS_PROF = { carol: 'carolina', 'riane maria': 'riane', gislaine: 'gislane', gislene: 'gislane', gedinilsa: 'gednilsa', filipe: 'felipe' };
const chaveProf = (nome) => { const n = normalizar(nome.replace(/\(.*?\)/g, '')); return APELIDOS_PROF[n] || n; };

function montarProfessores(presentations) {
  const mapa = new Map();
  const adicionar = (nome, lugar) => {
    const k = chaveProf(nome);
    if (!k) return;
    const prof = mapa.get(k) || { nomes: new Set(), lugares: new Map() };
    prof.nomes.add(nome.trim());
    // um cartão por local; oficinas e segmentos daquele local são somados no mesmo cartão
    const kl = [lugar.local, lugar.bloco].join('|');
    if (!prof.lugares.has(kl)) prof.lugares.set(kl, { local: lugar.local, bloco: lugar.bloco, oficinas: new Set(), segmentos: new Set(), grupos: 0, obs: lugar.obs, fonte: lugar.fonte });
    const l = prof.lugares.get(kl);
    l.oficinas.add(lugar.oficina); if (lugar.segmento) l.segmentos.add(lugar.segmento);
    l.grupos += lugar.conta ? 1 : 0;
    mapa.set(k, prof);
  };
  const vistos = new Set();
  for (const p of presentations) {
    if (!p.local || !p.responsaveis) continue;
    const grupo = [p.oficina, p.projeto, p.subgrupo, p.local].join('|');
    for (const nome of p.responsaveis.replace(/ e /g, ',').split(',').map((x) => x.trim()).filter(Boolean)) {
      const novoGrupo = !vistos.has(nome + grupo); vistos.add(nome + grupo);
      adicionar(nome, { local: p.local, bloco: p.bloco || '', oficina: p.oficina, segmento: p.segmento || '', conta: novoGrupo });
    }
  }
  for (const x of PROFESSORES_EXTRAS) adicionar(x.nome, { local: x.local, bloco: x.bloco || '', oficina: x.oficina, segmento: '', obs: x.obs, fonte: x.fonte, conta: false });
  return [...mapa.entries()].map(([k, p]) => {
    const nomes = [...p.nomes].sort((a, b) => b.length - a.length);
    return { nome: nomes[0], busca: normalizar([...nomes, k, ...Object.keys(APELIDOS_PROF).filter((a) => APELIDOS_PROF[a] === k)].join(' ')), lugares: [...p.lugares.values()] };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// "prof", "professor", "professora gotardo"… ativa a busca de professores.
function consultaProfessor(q) {
  const t = normalizar(q).split(' ').filter(Boolean);
  const p = t[0] || '';
  const ehProf = p.length >= 4 && (['professores', 'professoras'].some((w) => w.startsWith(p)) || ['profa', 'profs'].includes(p));
  return ehProf ? t.slice(1) : null;
}

function professoresHTML(termos) {
  const lista = (E.professores || []).filter((p) => termos.every((t) => p.busca.includes(t)));
  if (!lista.length) return `<div class="cartao vazio">${icone('user-search')}<strong>Nenhum professor encontrado</strong>Digite "prof" e o nome, por exemplo: prof Gotardo.</div>`;
  return `<p class="contagem">${lista.length} ${lista.length === 1 ? 'professor encontrado' : 'professores encontrados'} · onde estão na Mostra</p>
  <ul class="lista-resultados">${lista.map((p) => `
    <li class="professor">
      <div class="prof-cab"><span class="avatar">${icone('user-round')}</span><div><small>Professor(a)</small><strong>${esc(p.nome)}</strong></div></div>
      ${p.lugares.map((l) => `
        <div class="prof-local">${icone('map-pin')}<div><b>${esc(l.local)}${l.bloco ? ` · ${esc(l.bloco)}` : ''}</b>
          <span>${esc([...l.oficinas].join(' / '))}${l.segmentos.size ? ` · ${esc([...l.segmentos].join(' e '))}` : ''}${l.grupos > 1 ? ` · ${l.grupos} grupos` : ''}</span>
          ${l.obs ? `<span class="nota">${esc(l.obs)}</span>` : ''}${l.fonte ? `<span class="nota">Fonte: ${esc(l.fonte)}</span>` : ''}</div></div>`).join('')}
    </li>`).join('')}</ul>
  <button class="btn sec bloco" style="margin-top:12px" data-acao="ver-mapa">${icone('map')} Ver no mapa da Mostra</button>`;
}

function buscar(q) {
  const nq = normalizar(q);
  if (!nq) return [];
  const tokens = nq.split(' ');
  const out = [];
  for (const it of E.indice) {
    if (!tokens.every((t) => it.busca.includes(t))) continue;
    const palavras = it.busca.split(' ');
    const score = it.busca.startsWith(nq) ? 0 : tokens.every((t) => palavras.some((p) => p.startsWith(t))) ? 1 : 2;
    out.push({ s: it.s, score });
  }
  return out.sort((a, b) => a.score - b.score || a.s.nome.localeCompare(b.s.nome, 'pt-BR')).map((x) => x.s);
}

// destaca os trechos digitados no nome original (ignorando acentos)
function destacar(nome, q) {
  const tokens = normalizar(q).split(' ').filter(Boolean);
  if (!tokens.length) return esc(nome);
  let norm = ''; const mapa = [];
  [...nome].forEach((c, i) => {
    const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const ch of n || ' ') { norm += /[a-z0-9]/.test(ch) ? ch : ' '; mapa.push(i); }
  });
  const marcar = new Array(nome.length).fill(false);
  for (const t of tokens) {
    let i = norm.indexOf(t);
    while (i >= 0) { for (let k = i; k < i + t.length; k++) marcar[mapa[k]] = true; i = norm.indexOf(t, i + t.length); }
  }
  let html = ''; let aberto = false;
  [...nome].forEach((c, i) => {
    if (marcar[i] && !aberto) { html += '<mark>'; aberto = true; }
    if (!marcar[i] && aberto) { html += '</mark>'; aberto = false; }
    html += esc(c);
  });
  return html + (aberto ? '</mark>' : '');
}

const iniciais = (nome) => nome.split(' ').filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const textoTurma = (s) => [s.turma || 'Turma não informada', s.segmento].filter(Boolean).join(' · ');

// ════════════════════ ESTRUTURA ════════════════════
function cabecalho() {
  const admin = E.ambiente === 'admin';
  const st = store.status;
  return `
  <header class="cabecalho">
    <button class="logo-btn" data-acao="logo" aria-label="${admin ? 'Voltar ao ambiente dos guias' : 'Acesso administrativo'}">
      <img src="${esc(LOGO_URL)}" alt="Logo da Mostra SESI STEAM 2026" width="92" height="92">
    </button>
    <h1>Central dos Guias</h1>
    <p class="sub">Mostra SESI STEAM 2026</p>
    <p class="escola">${esc(ESCOLA_NOME)}</p>
    ${admin ? `<span class="selo-admin">${icone('shield-check')} Administração · ${esc(ADMIN_NOME)}</span>` : ''}
    ${store.modo === 'local'
      ? `<div class="faixa-previa">${icone('flask-conical')}<span><b>Prévia local, sem Firebase.</b> O que for cadastrado fica só neste navegador e não chega a outros aparelhos.</span></div>`
      : `<div class="faixa-status"><span class="ponto ${st.ok ? 'ok' : 'erro'}"></span><span id="status-conexao">${esc(st.texto)}</span></div>`}
  </header>`;
}

function render() {
  if (E.ambiente === 'admin' && !store.adminAtivo()) E.ambiente = 'guias';
  $app.innerHTML = E.ambiente === 'admin' ? telaAdmin() : telaGuias();
  icones();
  if (E.ambiente === 'guias' && E.aba === 'alunos' && !E.fichaId) ligarBusca();
  atualizarTimers(); depoisDeRenderAdmin();
}

// ════════════════════ GUIAS ════════════════════
function telaGuias() {
  const ativos = visitasAtivas().length;
  const aba = (id, ic, rot, extra = '') => `<button class="aba ${E.aba === id ? 'ativa' : ''}" data-acao="aba" data-aba="${id}" aria-pressed="${E.aba === id}">${icone(ic)}<span>${rot}</span>${extra}</button>`;
  let corpo = '';
  if (E.aba === 'alunos') corpo = E.fichaId ? telaFicha(E.fichaId) : telaAlunos();
  if (E.aba === 'onibus') corpo = telaOnibus();
  if (E.aba === 'mapa') corpo = telaMapa();
  return `${cabecalho()}
  <nav class="abas" aria-label="Seções">
    ${aba('alunos', 'bot', 'ALUNOS')}
    ${aba('onibus', 'bus', 'ÔNIBUS', ativos ? `<span class="contador">${ativos}</span>` : '')}
    ${aba('mapa', 'map', 'MAPA')}
  </nav>
  <main class="tela" id="conteudo">${corpo}</main>`;
}

function telaAlunos() {
  let estado = '';
  if (E.baseErro) estado = `<div class="cartao vazio">${icone('triangle-alert')}<strong>Não foi possível carregar a base de estudantes</strong>${esc(E.baseErro)}</div>`;
  else if (!E.base) estado = `<div class="cartao vazio"><div class="spinner" style="margin:0 auto 10px"></div>Carregando a base oficial…</div>`;
  else if (E.base.vazia) estado = `<div class="cartao vazio">${icone('database')}<strong>Base de estudantes ainda não publicada</strong>O administrador precisa publicar a base oficial no Firebase.</div>`;
  return `
  <h2 class="titulo-tela">Localização de Estudantes</h2>
  <div class="instrucao">${icone('megaphone')}<span>Guia, digite aqui o nome completo do aluno.</span></div>
  <div class="campo-busca" role="search">
    ${icone('search')}
    <label class="sr" for="busca">Pesquisar nome do estudante</label>
    <input id="busca" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
      placeholder="Pesquisar nome do estudante..." value="${esc(E.busca)}" ${E.base && !E.base.vazia ? '' : 'disabled'}>
    <button class="limpar ${E.busca ? '' : 'oculto'}" data-acao="limpar-busca" aria-label="Limpar pesquisa">${icone('x')}</button>
  </div>
  ${estado}
  <div id="resultados">${resultadosHTML()}</div>`;
}

function resultadosHTML() {
  if (!E.base || E.base.vazia) return '';
  const q = E.busca.trim();
  if (!q) return `<p class="contagem">${E.base.students.length} estudantes na base oficial. Nomes parciais funcionam (ex.: nome e sobrenome).<br>Para saber onde está um professor, digite <b>prof</b> e o nome (ex.: prof Gotardo).</p>`;
  const termosProf = consultaProfessor(q);
  if (termosProf) return professoresHTML(termosProf);
  const r = buscar(q);
  if (!r.length) return `<div class="cartao vazio">${icone('user-search')}<strong>Nenhum estudante encontrado</strong>Confira a grafia ou pesquise só o primeiro nome e um sobrenome.</div>`;
  const LIM = 60;
  return `<p class="contagem">${r.length} ${r.length === 1 ? 'estudante encontrado' : 'estudantes encontrados'}</p>
  <ul class="lista-resultados">${r.slice(0, LIM).map((s) => `
    <li><button class="resultado" data-acao="abrir-ficha" data-id="${esc(s.id)}">
      <span class="avatar">${esc(iniciais(s.nome))}</span>
      <span class="info">
        <span class="nome">${destacar(s.nome, q)}</span>
        <span class="meta">${esc(textoTurma(s))}</span>
        <span class="oficina">${(s.oficinas || []).map((o) => `<span class="chip vinho">${esc(o)}</span>`).join('')}</span>
      </span>
      ${icone('chevron-right')}
    </button></li>`).join('')}</ul>
  ${r.length > LIM ? `<p class="mais">Mostrando ${LIM} de ${r.length}. Digite mais letras do nome para refinar.</p>` : ''}`;
}

function ligarBusca() {
  const inp = document.getElementById('busca');
  if (!inp) return;
  inp.addEventListener('input', () => {
    E.busca = inp.value;
    document.getElementById('resultados').innerHTML = resultadosHTML();
    document.querySelector('.limpar')?.classList.toggle('oculto', !E.busca);
    icones();
  });
}

function estaAcontecendoAgora(sess) {
  if (!sess.dia) return false;
  const p = partes(agora());
  const [d, m] = sess.dia.split('/').map(Number);
  if (p.dia !== d || p.mes !== m || p.ano !== 2026) return false;
  const min = p.hora * 60 + p.min;
  const faixa = sess.horario ? sess.horario.split('–') : sess.turno === 'Manhã' ? ['07:00', '12:00'] : sess.turno === 'Tarde' ? ['12:00', '18:30'] : null;
  if (!faixa) return false;
  const [a, b] = faixa.map((h) => { const [x, y] = h.split(':').map(Number); return x * 60 + y; });
  return min >= a && min < b;
}

// Quando a base não traz nem turno nem horário, o guia vai à sala e pergunta ao professor regente.
// Turno informado (Manhã/Tarde) já basta: nesse caso não há orientação.
function orientacaoSemHorario(p) {
  const sessoes = p.sessoes || [];
  if (sessoes.some((s) => s.horario || s.turno)) return '';
  const falta = sessoes.length ? 'Turno e horário não informados na base oficial.' : 'Dia e horário de apresentação não informados na base oficial.';
  const artigo = /^(laborat|audit|estacion|bloco|p[aá]tio|refeit)/i.test(p.local || '') ? 'ao' : 'à';
  const local = p.local ? `${artigo} <b>${esc(p.local)}</b>${p.bloco ? ` (${esc(p.bloco)})` : ''}` : 'ao local da oficina';
  const varios = /,| e /.test(p.responsaveis || '');
  const rotulo = varios ? 'Professores regentes do grupo' : 'Professor regente do grupo';
  const prof = `<div class="prof-regente">${icone('user-round')}<span><small>${rotulo}</small><b>${esc(p.responsaveis || 'Não informado na base oficial')}</b></span></div>`;
  return `<div class="sem-horario">${icone('info', 'ic-p')} <span>${falta} <b>Guia, dirija-se ${local} e pergunte ${varios ? 'aos professores regentes' : 'ao professor regente'} do grupo.</b></span>${prof}</div>`;
}

const ROTULO_CONF ={ provavel: ['amarelo', 'Informação provável'], pendente: ['amarelo', 'A confirmar'] };

function telaFicha(id) {
  const s = E.alunoPorId.get(id);
  if (!s) return `<div class="cartao vazio">Estudante não encontrado.</div>`;
  const aps = (E.apsPorAluno.get(id) || []).slice();
  const cartoes = aps.map((p) => {
    const porDia = new Map();
    for (const se of p.sessoes || []) { const k = se.dia || ''; if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(se); }
    const sessoes = [...porDia.entries()].map(([dia, lista]) => `
      <div class="dia-bloco"><div>${icone('calendar-days', 'ic-p')} ${esc(rotuloDiaEvento(dia))}</div>
        ${lista.map((se) => `<div class="sessao"><span class="turno">${esc(se.turno || 'Turno não informado')}</span>
          <span>${se.horario ? esc(se.horario) : ''}${se.nota ? ` <span class="nota">(${esc(se.nota)})</span>` : ''}</span>
          ${estaAcontecendoAgora(se) ? '<span class="agora">AGORA</span>' : ''}</div>`).join('')}
      </div>`).join('');
    const conf = ROTULO_CONF[p.conf];
    return `
    <article class="cartao apresentacao">
      <div class="rotulo">Oficina</div>
      <h3>${esc(p.oficina)}</h3>
      ${p.projeto ? `<p class="projeto">${esc(p.projeto)}</p>` : ''}
      <div class="local-destaque">${icone('map-pin')}<div><strong>${esc(p.local || 'Local não informado')}</strong>${p.bloco ? `<small>${esc(p.bloco)}</small>` : '<small>Sala / espaço</small>'}</div></div>
      <div class="linhas">
        ${p.subgrupo ? `<div><span class="k">Subgrupo</span><span>${esc(p.subgrupo)}</span></div>` : ''}
        ${p.responsaveis ? `<div><span class="k">Responsáveis</span><span>${esc(p.responsaveis)}</span></div>` : ''}
        ${p.segmento ? `<div><span class="k">Ensino</span><span>${esc(p.segmento)}</span></div>` : ''}
      </div>
      ${conf ? `<div style="margin-top:10px"><span class="chip ${conf[0]}">${icone('info')} ${conf[1]}</span></div>` : ''}
      ${sessoes ? `<div class="sessoes">${sessoes}</div>` : ''}
      ${orientacaoSemHorario(p)}
      ${p.obs?.length ? `<ul class="obs">${p.obs.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
      ${p.fonte ? `<div class="fonte">Fonte: ${esc(p.fonte)}</div>` : ''}
    </article>`;
  }).join('');
  return `
  <div class="pilha">
    <button class="btn sec bloco voltar-topo" data-acao="voltar-pesquisa">${icone('arrow-left')} VOLTAR À PESQUISA</button>
    <section class="ficha-topo">
      <div class="rotulo">Ficha do estudante</div>
      <h2>${esc(s.nome)}</h2>
      <div class="ficha-dados">
        <div><small>Série</small><span>${esc(s.serieTexto || 'Não informada')}</span></div>
        <div><small>Turma</small><span>${esc(s.turma || 'Não informada')}</span></div>
        <div class="largo"><small>Ensino</small><span>${esc(s.segmento || 'Não informado')}</span></div>
        ${s.aliases?.length ? `<div class="largo"><small>Também aparece como</small><span>${esc(s.aliases.join(', '))}</span></div>` : ''}
      </div>
    </section>
    ${aps.length > 1 ? `<p class="contagem" style="margin:0">${icone('layers', 'ic-p')} Participa de ${aps.length} apresentações — todas listadas abaixo.</p>` : ''}
    ${cartoes}
    <button class="btn sec bloco" data-acao="ver-mapa">${icone('map')} Ver no mapa da Mostra</button>
  </div>
  <div class="barra-inferior"><button class="btn prim bloco" data-acao="voltar-pesquisa">${icone('arrow-left')} VOLTAR À PESQUISA</button></div>`;
}

// ── Ônibus ──
const visitasAtivas = () => E.visitas.filter((v) => !v.excluido && v.status === 'ativo')
  .sort((a, b) => a.saidaPrevistaMs - b.saidaPrevistaMs);

function cartaoOnibus(v, i, admin) {
  const tot = (v.estudantes ?? 0) + (v.professores ?? 0);
  const temNumeros = v.estudantes != null || v.professores != null;
  const n = (x) => (x == null ? '—' : x);
  return `
  <article class="onibus c${i % 4}">
    <div class="topo">
      <div><div class="rotulo">Escola visitante</div><h3>${esc(v.escola)}</h3></div>
      <span class="chip ${v.periodo === 'Manhã' ? 'amarelo' : ''}">${icone(v.periodo === 'Manhã' ? 'sunrise' : 'sunset')} ${esc(v.periodo)}</span>
    </div>
    <div class="timer-caixa">
      <div class="rotulo">Tempo restante</div>
      <div class="timer" data-timer="${esc(v.id)}">--:--:--</div>
      <div class="rodape">Chegada ${horaHHMM(v.chegadaMs)} · Saída prevista ${horaHHMM(v.saidaPrevistaMs)}${dataISO(v.saidaPrevistaMs) !== dataISO(v.chegadaMs) ? ` (${dataBR(dataISO(v.saidaPrevistaMs)).slice(0, 5)})` : ''}</div>
      <div class="aviso-saida oculto" data-aviso="${esc(v.id)}">Saída prevista atingida — aguardando confirmação.</div>
    </div>
    <div class="numeros">
      <div><strong>${n(v.estudantes)}</strong><small>Estudantes</small></div>
      <div><strong>${n(v.professores)}</strong><small>Professores</small></div>
      <div><strong>${temNumeros ? tot : '—'}</strong><small>Total</small></div>
    </div>
    <div class="grupos-info"><span class="k">Grupos formados:</span> ${v.totalGrupos ? `<b>${v.totalGrupos}</b> — ${esc(resumoGrupos(v.grupos))}` : 'não informado'}</div>
    ${v.distribuicaoDetalhe ? `<div class="grupos-info"><span class="k">Distribuição:</span> ${esc(v.distribuicaoDetalhe)}</div>` : ''}
    ${v.observacoes ? `<div class="obs-op"><b>Observações:</b> ${esc(v.observacoes)}</div>` : ''}
    ${admin ? `
    <div class="partiu-box">
      <div class="pergunta">O ÔNIBUS JÁ PARTIU?</div>
      <div class="grade-2">
        <button class="btn sec p" data-acao="editar" data-id="${esc(v.id)}">${icone('pencil')} EDITAR</button>
        <button class="btn prim p" data-acao="partida" data-id="${esc(v.id)}">${icone('circle-check')} CONFIRMAR PARTIDA</button>
      </div>
    </div>` : ''}
  </article>`;
}

function blocoNotificacoes() {
  if (!('Notification' in window)) return `<div class="cartao notif-card">${icone('bell-off')}<p>Este navegador não oferece notificações. Os avisos aparecem dentro do sistema.</p></div>`;
  if (Notification.permission === 'granted') return `<div class="cartao notif-card">${icone('bell-ring')}<p>Notificações ativadas neste aparelho. Os avisos também aparecem dentro do sistema.</p></div>`;
  if (Notification.permission === 'denied') return `<div class="cartao notif-card">${icone('bell-off')}<p>Notificações bloqueadas no navegador. Os avisos continuam aparecendo dentro do sistema.</p></div>`;
  return `<div class="cartao notif-card">${icone('bell')}<p style="flex:1">Receba um aviso no aparelho quando um ônibus atingir o horário de saída.</p><button class="btn amarelo p" data-acao="notificacoes">Ativar</button></div>`;
}

function telaOnibus() {
  const ativos = visitasAtivas();
  return `
  <h2 class="titulo-tela">Escolas Visitantes</h2>
  <p class="sub-tela">Acompanhe os horários e a organização dos grupos.</p>
  <div class="resumo-onibus">${icone('bus', 'ic-g')}<div class="num">${ativos.length}</div><span>${ativos.length === 1 ? 'escola / visita ativa no evento' : 'escolas / visitas ativas no evento'}</span></div>
  ${ativos.length ? ativos.map((v, i) => cartaoOnibus(v, i, false)).join('') : `<div class="cartao vazio">${icone('bus')}<strong>Nenhuma escola visitante no momento</strong>Quando a administração cadastrar um ônibus, ele aparece aqui automaticamente.</div>`}
  <div style="margin-top:12px">${blocoNotificacoes()}</div>`;
}

// ── Mapa ──
function telaMapa() {
  const m = E.mapa;
  return `
  <h2 class="titulo-tela">Mapa da Mostra</h2>
  <p class="sub-tela">Consulte as salas, blocos e espaços do evento.</p>
  ${m ? `
    <div class="mapa-caixa"><img src="${esc(m.src)}" alt="Mapa oficial da Mostra SESI STEAM 2026" data-acao="expandir-mapa"></div>
    <button class="btn prim bloco" style="margin-top:12px" data-acao="expandir-mapa">${icone('maximize-2')} EXPANDIR MAPA</button>`
    : `<div class="cartao vazio">${icone('map')}<strong>Mapa do evento ainda não disponível.</strong>O mapa oficial será disponibilizado pela coordenação da Mostra.</div>`}`;
}

function abrirVisor() {
  if (!E.mapa) return;
  const v = document.createElement('div');
  v.className = 'visor'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Mapa ampliado');
  v.innerHTML = `<img alt="Mapa oficial ampliado" src="${esc(E.mapa.src)}">
    <span class="visor-dica">Use dois dedos para ampliar</span>
    <button class="visor-fechar" aria-label="Fechar mapa">${icone('x')}</button>
    <div class="visor-barra">
      <button data-z="-1" aria-label="Afastar">${icone('zoom-out')}</button>
      <button data-z="0" aria-label="Centralizar">${icone('locate-fixed')}</button>
      <button data-z="1" aria-label="Aproximar">${icone('zoom-in')}</button>
    </div>`;
  document.body.appendChild(v); icones();
  const img = v.querySelector('img');
  let base = 1, s = 1, x = 0, y = 0;
  const aplicar = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
  const limitar = () => {
    const w = img.naturalWidth * s, h = img.naturalHeight * s, W = v.clientWidth, H = v.clientHeight;
    x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, x));
    y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, y));
  };
  const centralizar = () => { base = Math.min(v.clientWidth / img.naturalWidth, v.clientHeight / img.naturalHeight); s = base; limitar(); aplicar(); };
  const zoomEm = (fator, cx, cy) => {
    const ns = Math.min(base * 8, Math.max(base, s * fator));
    x = cx - (cx - x) * (ns / s); y = cy - (cy - y) * (ns / s); s = ns; limitar(); aplicar();
  };
  if (img.complete && img.naturalWidth) centralizar(); else img.onload = centralizar;
  const ptrs = new Map(); let ultimo = null; let ultimoToque = 0;
  v.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    v.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); ultimo = null;
    if (ptrs.size === 1) {
      const t = Date.now();
      if (t - ultimoToque < 300) zoomEm(s > base * 1.5 ? base / s : 2.5, e.clientX, e.clientY);
      ultimoToque = t;
    }
  });
  v.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const ant = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { x += e.clientX - ant.x; y += e.clientY - ant.y; limitar(); aplicar(); return; }
    const [a, b] = [...ptrs.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (ultimo) { x += cx - ultimo.cx; y += cy - ultimo.cy; zoomEm(dist / ultimo.dist, cx, cy); }
    ultimo = { dist, cx, cy };
  });
  const soltar = (e) => { ptrs.delete(e.pointerId); ultimo = null; };
  v.addEventListener('pointerup', soltar); v.addEventListener('pointercancel', soltar);
  v.addEventListener('wheel', (e) => { e.preventDefault(); zoomEm(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  v.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => {
    const z = +b.dataset.z;
    if (z === 0) centralizar(); else zoomEm(z > 0 ? 1.5 : 1 / 1.5, v.clientWidth / 2, v.clientHeight / 2);
  }));
  const fechar = () => { v.remove(); window.removeEventListener('resize', centralizar); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => e.key === 'Escape' && fechar();
  v.querySelector('.visor-fechar').addEventListener('click', fechar);
  window.addEventListener('resize', centralizar); document.addEventListener('keydown', esc_);
}

// ════════════════════ ALERTAS E CRONÔMETROS ════════════════════
// Alertas fechados com o X valem só enquanto o app estiver aberto; ao sair e voltar, reaparecem.
const alertasFechados = new Set();
const fechados = () => [...alertasFechados];
const avisados = new Set(); // notificações já disparadas neste carregamento
let assinaturaAlertas = '';

function atualizarTimers() {
  const t = agora();
  for (const el of document.querySelectorAll('[data-timer]')) {
    const v = E.visitas.find((x) => x.id === el.dataset.timer);
    if (!v) continue;
    const r = v.saidaPrevistaMs - t;
    el.textContent = cronometro(r);
    el.classList.toggle('fim', r <= 0);
    document.querySelector(`[data-aviso="${CSS.escape(v.id)}"]`)?.classList.toggle('oculto', r > 0);
  }
  const vencidas = visitasAtivas().filter((v) => v.saidaPrevistaMs <= t);
  for (const v of vencidas) dispararNotificacao(v);
  const visiveis = vencidas.filter((v) => !fechados().includes(v.id));
  const assinatura = visiveis.map((v) => v.id + v.escola).join('|');
  if (assinatura !== assinaturaAlertas) {
    assinaturaAlertas = assinatura;
    $alertas.innerHTML = visiveis.map((v) => `
      <div class="alerta" role="alert">
        ${icone('triangle-alert', 'ic-alerta')}
        <div><strong>ATENÇÃO: A escola <em>${esc(v.escola)}</em> está no horário de saída!</strong><p>Aguardando confirmação de partida.</p></div>
        <button class="fechar" data-acao="fechar-alerta" data-id="${esc(v.id)}" aria-label="Fechar aviso">${icone('x')}</button>
      </div>`).join('');
    icones();
  }
}

async function dispararNotificacao(v) {
  if (avisados.has(v.id)) return;
  avisados.add(v.id);
  if (store.adminAtivo()) store.registrarAlerta(v).catch(() => {});
  const chave = 'cg_notif_' + v.id;
  try { if (localStorage.getItem(chave)) return; } catch { /* segue */ }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const titulo = 'Horário de saída atingido';
    const corpo = `ATENÇÃO: A escola ${v.escola} está no horário de saída! Aguardando confirmação de partida.`;
    if (reg) await reg.showNotification(titulo, { body: corpo, tag: 'saida-' + v.id, icon: LOGO_URL, badge: LOGO_URL });
    else new Notification(titulo, { body: corpo, tag: 'saida-' + v.id, icon: LOGO_URL });
    localStorage.setItem(chave, '1');
  } catch { /* o aviso dentro do sistema continua valendo */ }
}

async function ativarNotificacoes() {
  try {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.register('sw.js');
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Notificações ativadas neste aparelho.' : 'Permissão não concedida. Os avisos seguem dentro do sistema.');
  } catch { toast('Não foi possível ativar as notificações neste navegador.'); }
  render();
}

// ════════════════════ MODAIS ════════════════════
function abrirModal(html, aoAbrir) {
  $modal.innerHTML = `<div class="fundo-modal">${html}</div>`;
  icones();
  const fundo = $modal.firstElementChild;
  const fechar = () => { $modal.innerHTML = ''; document.removeEventListener('keydown', tecla); };
  const tecla = (e) => e.key === 'Escape' && fechar();
  document.addEventListener('keydown', tecla);
  fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
  aoAbrir?.(fundo, fechar);
  return fechar;
}

function confirmar(titulo, texto, rotuloOk = 'CONFIRMAR', classeOk = 'prim') {
  return new Promise((res) => {
    let resposta = false;
    abrirModal(`
      <div class="modal" role="alertdialog" aria-modal="true">
        <div class="modal-cab"><h2>${esc(titulo)}</h2><button class="fechar" data-fechar aria-label="Fechar">${icone('x')}</button></div>
        <div class="modal-corpo"><p style="margin:0">${texto}</p></div>
        <div class="modal-rodape"><button class="btn ${classeOk} bloco" data-ok>${esc(rotuloOk)}</button><button class="btn sec bloco" data-fechar>Cancelar</button></div>
      </div>`, (f, fechar) => {
      f.querySelector('[data-ok]').addEventListener('click', () => { resposta = true; fechar(); });
      new MutationObserver((_, obs) => { if (!$modal.firstElementChild) { obs.disconnect(); res(resposta); } }).observe($modal, { childList: true });
    });
  });
}

function abrirPin() {
  abrirModal(`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-pin">
      <div class="modal-cab"><h2 id="t-pin">ACESSO ADMINISTRATIVO</h2><p>Central dos Guias SESI STEAM</p><button class="fechar" data-fechar aria-label="Fechar">${icone('x')}</button></div>
      <form class="modal-corpo" id="form-pin" autocomplete="off">
        <p class="texto-centro">Digite a senha numérica de ${PIN_DIGITOS} dígitos.</p>
        <div class="pin" id="pin-bolas">
          ${'<span></span>'.repeat(PIN_DIGITOS)}
          <input class="pin-input" id="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="${PIN_DIGITOS}" autocomplete="one-time-code" aria-label="Senha numérica">
        </div>
        <div class="msg-erro" id="pin-erro"></div>
        <button class="btn prim bloco" id="pin-ok" type="submit" disabled>${icone('lock-keyhole-open')} ENTRAR</button>
      </form>
    </div>`, (f, fechar) => {
    const inp = f.querySelector('#pin'), bolas = f.querySelectorAll('.pin span'), ok = f.querySelector('#pin-ok'), erro = f.querySelector('#pin-erro');
    const pintar = () => { bolas.forEach((b, i) => b.classList.toggle('cheio', i < inp.value.length)); ok.disabled = inp.value.length !== PIN_DIGITOS; };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, PIN_DIGITOS); erro.textContent = ''; pintar(); if (inp.value.length === PIN_DIGITOS) f.querySelector('form').requestSubmit(); });
    f.querySelector('#pin-bolas').addEventListener('click', () => inp.focus());
    setTimeout(() => inp.focus(), 60);
    f.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (inp.value.length !== PIN_DIGITOS || ok.dataset.ocupado) return;
      ok.dataset.ocupado = '1'; ok.disabled = true; ok.innerHTML = '<span class="spinner p claro"></span> Verificando…';
      try {
        await store.entrarAdmin(inp.value);
        fechar(); E.ambiente = 'admin'; E.abaAdmin = 'onibus'; ligarAdmin(); render(); scrollTo(0, 0); toast('Acesso administrativo liberado.');
      } catch (err) {
        erro.textContent = err.message; inp.value = ''; pintar();
        const b = f.querySelector('.pin'); b.classList.remove('erro'); void b.offsetWidth; b.classList.add('erro');
        ok.innerHTML = `${icone('lock-keyhole-open')} ENTRAR`; icones(); delete ok.dataset.ocupado; inp.focus();
      }
    });
  });
}

// ════════════════════ ADMINISTRAÇÃO ════════════════════
let adminLigado = false;
function ligarAdmin() {
  if (adminLigado) return;
  adminLigado = true;
  store.ouvirAuditoria((l) => { E.auditoria = l; if (E.ambiente === 'admin' && E.abaAdmin === 'historico') renderConteudo(); });
}

function telaAdmin() {
  const aba = (id, ic, rot) => `<button class="aba ${E.abaAdmin === id ? 'ativa' : ''}" data-acao="aba-admin" data-aba="${id}" aria-pressed="${E.abaAdmin === id}">${icone(ic)}<span>${rot}</span></button>`;
  return `${cabecalho()}
  <div class="acoes-admin">
    <button class="btn sec" data-acao="voltar-guias">${icone('arrow-left')} VOLTAR AOS GUIAS</button>
    <button class="btn sec icone" data-acao="sair-admin" aria-label="Sair da administração">${icone('log-out')}</button>
  </div>
  <div id="aviso-base"></div>
  <nav class="abas-admin" aria-label="Administração">
    ${aba('onibus', 'bus', '1. ÔNIBUS')}${aba('mapa', 'map', '2. MAPA')}${aba('historico', 'history', '3. HISTÓRICO')}
  </nav>
  <main class="tela" id="conteudo">${conteudoAdmin()}</main>`;
}
const conteudoAdmin = () => (E.abaAdmin === 'onibus' ? adminOnibus() : E.abaAdmin === 'mapa' ? adminMapa() : adminHistorico());

function renderConteudo() {
  const c = document.getElementById('conteudo');
  if (!c) return render();
  if (E.ambiente === 'guias') {
    const btn = document.querySelector('.abas [data-aba="onibus"]');
    const n = visitasAtivas().length;
    if (btn) { btn.querySelector('.contador')?.remove(); if (n) btn.insertAdjacentHTML('beforeend', `<span class="contador">${n}</span>`); }
  }
  if (E.ambiente === 'admin') c.innerHTML = conteudoAdmin();
  else if (E.aba === 'onibus') c.innerHTML = telaOnibus();
  else if (E.aba === 'mapa') c.innerHTML = telaMapa();
  else if (E.fichaId) c.innerHTML = telaFicha(E.fichaId);
  else return; // a tela de busca não é redesenhada para não tirar o foco do campo
  icones(); atualizarTimers(); depoisDeRenderAdmin();
}

function adminOnibus() {
  const ativos = visitasAtivas();
  return `
  <button class="btn prim bloco" data-acao="cadastrar">${icone('circle-plus')} CADASTRAR ESCOLA / ÔNIBUS</button>
  <div class="resumo-onibus" style="margin-top:12px">${icone('bus', 'ic-g')}<div class="num">${ativos.length}</div><span>${ativos.length === 1 ? 'ônibus ativo' : 'ônibus ativos'} · partidas confirmadas vão para o Histórico</span></div>
  ${ativos.length ? ativos.map((v, i) => cartaoOnibus(v, i, true)).join('') : `<div class="cartao vazio">${icone('bus')}<strong>Nenhum ônibus ativo</strong>Use o botão acima para cadastrar a chegada de uma escola visitante.</div>`}`;
}

// ── Formulário de visita ──
function abrirFormVisita(existente = null) {
  const t = agora();
  const f = existente ? {
    escola: existente.escola, chegadaMs: existente.chegadaMs, minutos: existente.minutos, periodo: existente.periodo, periodoManual: true,
    estudantes: existente.estudantes ?? '', professores: existente.professores ?? '', grupos: (existente.grupos || []).map((g) => ({ ...g })),
    distribuicaoDetalhe: existente.distribuicaoDetalhe || '', observacoes: existente.observacoes || '', status: existente.status, partidaMs: existente.partidaMs,
  } : {
    escola: '', chegadaMs: t, minutos: '', periodo: periodoDe(t), periodoManual: false, estudantes: '', professores: '',
    grupos: [{ qtd: '', tamanho: '' }], distribuicaoDetalhe: '', observacoes: '', status: 'ativo', partidaMs: null,
  };
  if (!f.grupos.length) f.grupos.push({ qtd: '', tamanho: '' });
  const ed = !!existente;
  abrirModal(`
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-visita">
    <div class="modal-cab"><h2 id="t-visita">${ed ? 'Editar Escola / Ônibus' : 'Cadastrar Escola / Ônibus'}</h2><p>Central dos Guias SESI STEAM</p><button class="fechar" data-fechar aria-label="Fechar">${icone('x')}</button></div>
    <form class="modal-corpo" id="form-visita" novalidate>
      <div class="faixa-data">
        <span id="f-data-rot"></span>
        <div class="alternador" role="group" aria-label="Período">
          <button type="button" data-per="Manhã">Manhã</button><button type="button" data-per="Tarde">Tarde</button>
        </div>
      </div>
      <p class="ajuda" id="f-per-ajuda" style="font-size:12.5px;color:var(--cinza);margin:6px 2px 0"></p>

      <div class="secao campo">
        <label for="f-escola">NOME DA ESCOLA *</label>
        <input id="f-escola" type="text" maxlength="120" autocomplete="off" autocapitalize="words" enterkeyhint="next" placeholder="Digite o nome da escola visitante..." value="${esc(f.escola)}">
        <div class="erro-campo" id="e-escola"></div>
      </div>

      <div class="secao secao-dest">
        <div class="campo">
          <label for="f-min">TEMPO DE PERMANÊNCIA (MINUTOS) *</label>
          <p class="ajuda">Informe quanto tempo a escola permanecerá no evento (ex.: 60, 15, 90 minutos).</p>
          <div class="com-unidade"><input id="f-min" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="1440" step="1" placeholder="Ex.: 60" value="${esc(f.minutos)}"><span>minutos</span></div>
          <div class="atalhos">${[15, 30, 45, 60, 90, 120].map((m) => `<button type="button" data-min="${m}">${m} min</button>`).join('')}</div>
          <div class="erro-campo" id="e-min"></div>
        </div>
        <div class="previa-saida" aria-live="polite">
          <div class="rotulo">HORÁRIO PREVISTO DE SAÍDA</div>
          <div class="linha"><span>Horário de chegada</span><b id="p-cheg"></b></div>
          <div class="linha"><span>Tempo digitado</span><b id="p-min"></b></div>
          <div class="grande">Saída prevista: <b id="p-saida">—</b></div>
          <div class="linha" style="font-size:12px"><span id="p-relogio"></span></div>
        </div>
        <button type="button" class="btn sec p bloco" style="margin-top:10px" id="btn-corrigir">${icone('clock')} Corrigir horário de chegada</button>
        <div class="corrigir oculto" id="caixa-corrigir">
          <div class="campo" style="margin:0"><label for="f-cheg-data">Data</label><input id="f-cheg-data" type="date"></div>
          <div class="campo" style="margin:0"><label for="f-cheg-hora">Hora</label><input id="f-cheg-hora" type="time" step="60"></div>
        </div>
      </div>

      <div class="secao cartao">
        <div class="rotulo" style="color:var(--vinho)">CONTINGENTE DE VISITANTES (OPCIONAL)</div>
        <p class="ajuda" style="font-size:13px;color:var(--cinza);margin:4px 0 0">Pode cadastrar sem preencher.</p>
        <div class="grade-2">
          <div class="campo"><label for="f-est">Quantidade de Estudantes</label><input id="f-est" type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" placeholder="Ex.: 50 (opcional)" value="${esc(f.estudantes)}"></div>
          <div class="campo"><label for="f-prof">Quantidade de Professores</label><input id="f-prof" type="number" inputmode="numeric" pattern="[0-9]*" min="0" step="1" placeholder="Ex.: 4 (opcional)" value="${esc(f.professores)}"></div>
        </div>
        <div class="erro-campo" id="e-cont"></div>
        <div class="total-visitantes" id="p-total"></div>
      </div>

      <div class="secao cartao">
        <div class="rotulo" style="color:var(--vinho)">GRUPOS FORMADOS (OPCIONAL)</div>
        <div id="linhas-grupos"></div>
        <button type="button" class="btn sec p" style="margin-top:8px" id="add-grupo">${icone('plus')} Adicionar outra divisão</button>
        <div class="total-visitantes" id="p-grupos"></div>
        <div class="aviso-campo oculto" id="a-grupos"></div>
        <div class="campo"><label for="f-dist">Distribuição dos grupos (opcional)</label><input id="f-dist" type="text" maxlength="200" placeholder="Ex.: grupos 1 a 5 com a guia Ana" value="${esc(f.distribuicaoDetalhe)}"></div>
      </div>

      <div class="secao campo">
        <label for="f-obs">Observações operacionais autorizadas</label>
        <textarea id="f-obs" maxlength="400" placeholder="Somente informações autorizadas para os guias.">${esc(f.observacoes)}</textarea>
      </div>

      ${ed ? `
      <div class="secao cartao">
        <div class="rotulo" style="color:var(--vinho)">STATUS</div>
        <div class="campo"><label for="f-status">Situação da visita</label>
          <select id="f-status"><option value="ativo">Ativo — no evento</option><option value="partiu">Partiu</option></select></div>
        <div class="corrigir ${f.status === 'partiu' ? '' : 'oculto'}" id="caixa-partida">
          <div class="campo" style="margin:0"><label for="f-part-data">Data da partida</label><input id="f-part-data" type="date"></div>
          <div class="campo" style="margin:0"><label for="f-part-hora">Hora da partida</label><input id="f-part-hora" type="time" step="60"></div>
        </div>
      </div>` : ''}
    </form>
    <div class="modal-rodape">
      <button class="btn prim bloco" id="f-salvar">${icone('save')} ${ed ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR ÔNIBUS'}</button>
    </div>
  </div>`, (fundo, fechar) => {
    const q = (s) => fundo.querySelector(s);
    const ler = () => {
      f.escola = q('#f-escola').value; f.minutos = q('#f-min').value;
      f.estudantes = q('#f-est').value; f.professores = q('#f-prof').value;
      f.distribuicaoDetalhe = q('#f-dist').value; f.observacoes = q('#f-obs').value;
    };
    const desenharGrupos = () => {
      q('#linhas-grupos').innerHTML = f.grupos.map((g, i) => `
        <div class="linha-grupo" data-i="${i}">
          <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" placeholder="Qtd." aria-label="Quantidade de grupos" data-g="qtd" value="${esc(g.qtd)}">
          <span>grupos de</span>
          <input type="number" inputmode="numeric" pattern="[0-9]*" min="0" placeholder="Alunos" aria-label="Estudantes por grupo" data-g="tamanho" value="${esc(g.tamanho)}">
          <button type="button" class="btn sec icone" data-rem="${i}" aria-label="Remover divisão" ${f.grupos.length === 1 ? 'disabled' : ''}>${icone('trash-2', 'ic-p')}</button>
        </div>`).join('');
      icones();
    };
    const atualizar = () => {
      ler();
      const cheg = f.chegadaMs;
      if (!f.periodoManual) f.periodo = periodoDe(cheg);
      const iso = dataISO(cheg);
      q('#f-data-rot').innerHTML = `${icone('calendar', 'ic-p')} Data: ${dataBR(iso)} · Período da ${f.periodo}`;
      q('#f-per-ajuda').textContent = f.periodoManual && !ed ? 'Período ajustado manualmente.' : 'Período definido pelo horário local (America/Bahia); toque para ajustar.';
      fundo.querySelectorAll('[data-per]').forEach((b) => b.classList.toggle('on', b.dataset.per === f.periodo));
      const min = inteiroOuNulo(f.minutos);
      q('#p-cheg').textContent = `${horaHHMM(cheg)}${iso !== dataISO(agora()) ? ` (${dataBR(iso).slice(0, 5)})` : ''}`;
      q('#p-min').textContent = min ? `${min} minutos` : '—';
      if (min && min > 0 && min <= 1440) {
        const s = cheg + min * 60000;
        q('#p-saida').textContent = `${horaHHMM(s)}${dataISO(s) !== iso ? ` (${dataBR(dataISO(s)).slice(0, 5)})` : ''}`;
      } else q('#p-saida').textContent = '—';
      q('#p-relogio').textContent = relogioConfiavel() ? 'Relógio sincronizado com o servidor.' : 'Relógio do aparelho (servidor sem horário disponível).';
      fundo.querySelectorAll('[data-min]').forEach((b) => b.classList.toggle('on', String(min) === b.dataset.min));
      const e = inteiroOuNulo(f.estudantes), p = inteiroOuNulo(f.professores);
      q('#p-total').innerHTML = (e == null && p == null) ? 'Nenhum visitante informado (opcional)'
        : (Number.isNaN(e) || Number.isNaN(p)) ? 'Use apenas números inteiros (0 ou mais).'
          : `<b>Total Geral de Visitantes:</b> ${e ?? 0} estudantes + ${p ?? 0} professores = <b>${(e ?? 0) + (p ?? 0)}</b> visitantes`;
      const linhas = f.grupos.map((g) => ({ qtd: inteiroOuNulo(g.qtd) || 0, tamanho: inteiroOuNulo(g.tamanho) || 0 }));
      const tg = totalGrupos(linhas);
      q('#p-grupos').textContent = tg ? `${tg} grupos: ${resumoGrupos(linhas)}` : 'Nenhum grupo informado (opcional)';
      const soma = linhas.reduce((s, l) => s + l.qtd * l.tamanho, 0);
      const av = q('#a-grupos');
      if (tg && e != null && !Number.isNaN(e) && linhas.every((l) => !l.qtd || l.tamanho) && soma !== e) { av.textContent = `Atenção: os grupos somam ${soma} estudantes, mas foram informados ${e}.`; av.classList.remove('oculto'); } else av.classList.add('oculto');
    };
    const sincCorrecao = () => { q('#f-cheg-data').value = dataISO(f.chegadaMs); q('#f-cheg-hora').value = horaHHMM(f.chegadaMs); };
    desenharGrupos(); sincCorrecao(); atualizar();
    if (ed) {
      q('#f-status').value = f.status;
      const pm = f.partidaMs ?? agora();
      q('#f-part-data').value = dataISO(pm); q('#f-part-hora').value = horaHHMM(pm);
      q('#f-status').addEventListener('change', () => q('#caixa-partida').classList.toggle('oculto', q('#f-status').value !== 'partiu'));
    }
    fundo.querySelector('form').addEventListener('input', (ev) => {
      const g = ev.target.dataset.g;
      if (g) f.grupos[+ev.target.closest('[data-i]').dataset.i][g] = ev.target.value;
      if (ev.target.id === 'f-cheg-data' || ev.target.id === 'f-cheg-hora') {
        const d = q('#f-cheg-data').value, h = q('#f-cheg-hora').value;
        if (d && h) f.chegadaMs = bahiaParaMs(d, h);
      }
      atualizar();
    });
    fundo.querySelector('form').addEventListener('submit', (ev) => ev.preventDefault());
    fundo.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.per) { f.periodo = b.dataset.per; f.periodoManual = true; atualizar(); }
      if (b.dataset.min) { q('#f-min').value = b.dataset.min; atualizar(); }
      if (b.dataset.rem) { f.grupos.splice(+b.dataset.rem, 1); desenharGrupos(); atualizar(); }
      if (b.id === 'add-grupo') { f.grupos.push({ qtd: '', tamanho: '' }); desenharGrupos(); atualizar(); }
      if (b.id === 'btn-corrigir') { q('#caixa-corrigir').classList.toggle('oculto'); sincCorrecao(); }
    });
    q('#f-salvar').addEventListener('click', async () => {
      ler();
      const erros = {};
      const escola = f.escola.trim().replace(/\s+/g, ' ');
      if (!escola) erros.escola = 'Informe o nome da escola.';
      const min = inteiroOuNulo(f.minutos);
      if (min == null || Number.isNaN(min) || min < 1 || min > 1440) erros.min = 'Digite os minutos de permanência (número inteiro entre 1 e 1440).';
      const est = inteiroOuNulo(f.estudantes), prof = inteiroOuNulo(f.professores);
      if (Number.isNaN(est) || Number.isNaN(prof)) erros.cont = 'Estudantes e professores aceitam somente números inteiros não negativos.';
      q('#e-escola').textContent = erros.escola || ''; q('#e-min').textContent = erros.min || ''; q('#e-cont').textContent = erros.cont || '';
      if (Object.keys(erros).length) { (erros.escola ? q('#f-escola') : erros.min ? q('#f-min') : q('#f-est')).focus(); return; }
      const linhas = f.grupos.map((g) => ({ qtd: inteiroOuNulo(g.qtd) || 0, tamanho: inteiroOuNulo(g.tamanho) || 0 })).filter((l) => l.qtd > 0);
      const dados = {
        escola, escolaNorm: normalizar(escola), data: dataISO(f.chegadaMs), periodo: f.periodo,
        chegadaMs: f.chegadaMs, minutos: min, saidaPrevistaMs: f.chegadaMs + min * 60000,
        estudantes: est, professores: prof, grupos: linhas, totalGrupos: totalGrupos(linhas),
        distribuicao: resumoGrupos(linhas), distribuicaoDetalhe: f.distribuicaoDetalhe.trim(), observacoes: f.observacoes.trim(),
      };
      if (ed) {
        dados.status = q('#f-status').value;
        dados.partidaMs = dados.status === 'partiu' ? bahiaParaMs(q('#f-part-data').value || dataISO(agora()), q('#f-part-hora').value || horaHHMM(agora())) : null;
      } else Object.assign(dados, { status: 'ativo', partidaMs: null, excluido: false });
      const bt = q('#f-salvar'); bt.disabled = true; bt.innerHTML = '<span class="spinner p claro"></span> Salvando…';
      try {
        if (ed) await store.atualizarVisita(existente.id, dados, 'edicao'); else await store.criarVisita(dados);
        fechar(); toast(ed ? 'Alterações salvas.' : 'Ônibus cadastrado. Os guias já estão vendo.');
      } catch (err) {
        bt.disabled = false; bt.innerHTML = `${icone('save')} TENTAR NOVAMENTE`; icones();
        toast('Erro ao salvar: ' + err.message, 5000);
      }
    });
    setTimeout(() => !ed && q('#f-escola').focus(), 80);
  });
}

// ── Mapa (admin) ──
// O mapa oficial enviado pela coordenação fica sempre disponível; a administração pode substituí-lo.
const MAPA_PADRAO = { src: MAPA_OFICIAL_URL, nome: 'Mapa oficial da Mostra (coordenação)', padrao: true };

function adminMapa() {
  const m = E.mapa;
  return `
  <div class="cartao">
    <div class="rotulo">Mapa que os guias estão vendo</div>
    <div class="mapa-admin-prev" style="margin-top:8px"><img src="${esc(m.src)}" alt="Mapa exibido aos guias"></div>
    ${m.padrao
      ? `<p style="font-size:13px;color:var(--cinza);margin:8px 0 0">Mapa oficial fornecido pela coordenação (padrão). Para trocar, publique outra imagem abaixo.</p>`
      : `<p style="font-size:13px;color:var(--cinza);margin:8px 0 0">${esc(m.nome || '')} · publicado em ${dataHoraBR(m.publicadoEmMs)}</p>
        <button class="btn perigo bloco" style="margin-top:10px" data-acao="remover-mapa">${icone('rotate-ccw')} Voltar ao mapa oficial padrão</button>`}
  </div>
  <div class="cartao">
    <div class="rotulo">Substituir mapa por endereço (link da imagem)</div>
    <div class="campo"><label for="m-url">Link da imagem</label><input id="m-url" type="url" inputmode="url" autocomplete="off" placeholder="https://..." value=""></div>
    <button class="btn prim bloco" style="margin-top:10px" data-acao="publicar-mapa-url">${icone('upload')} PUBLICAR MAPA</button>
    <div class="ou">ou</div>
    <div class="rotulo">Enviar imagem do aparelho</div>
    <input type="file" id="m-arquivo" accept="image/*" class="oculto">
    <button class="btn sec bloco" style="margin-top:8px" data-acao="escolher-arquivo-mapa">${icone('image-plus')} Escolher imagem</button>
    <p style="font-size:12.5px;color:var(--cinza);margin:8px 0 0">A imagem é otimizada no aparelho antes de ser salva, sem cortes nem distorção.</p>
  </div>`;
}

function testarImagem(src) {
  return new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => rej(new Error('A imagem não pôde ser carregada desse endereço.')); i.src = src;
  });
}

async function comprimirImagem(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Arquivo de imagem inválido.')); i.src = url; });
    let lado = 2400, qualidade = 0.85, dataUrl = '';
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const esc_ = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * esc_); c.height = Math.round(img.naturalHeight * esc_);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      dataUrl = c.toDataURL('image/jpeg', qualidade);
      if (dataUrl.length < 900_000) return { dataUrl, w: c.width, h: c.height };
      if (qualidade > 0.6) qualidade -= 0.1; else lado = Math.round(lado * 0.8);
    }
    throw new Error('Imagem muito grande mesmo após otimizar.');
  } finally { URL.revokeObjectURL(url); }
}

// ── Histórico ──
function classificar(v, d) {
  const dia = v.data === d?.dia1 ? 1 : v.data === d?.dia2 ? 2 : 0;
  return dia ? `d${dia}${v.periodo === 'Manhã' ? 'm' : 't'}` : 'outro';
}

export function indicadores(lista) {
  const validas = lista.filter((v) => !v.excluido);
  const est = validas.reduce((s, v) => s + (v.estudantes || 0), 0);
  const prof = validas.reduce((s, v) => s + (v.professores || 0), 0);
  return {
    visitas: validas.length, escolas: new Set(validas.map((v) => v.escolaNorm || normalizar(v.escola))).size,
    estudantes: est, professores: prof, participacoes: est + prof, grupos: validas.reduce((s, v) => s + (v.totalGrupos || 0), 0),
  };
}

function adminHistorico() {
  const ind = indicadores(E.visitas);
  const d = E.datasRascunho || E.datas || {};
  const conta = (dia, per) => E.visitas.filter((v) => !v.excluido && v.data === dia && v.periodo === per).length;
  const h = E.hist;
  const filtroOk = (v) => h.filtro === 'todos' || classificar(v, E.datas) === h.filtro;
  const lista = E.visitas.filter((v) => (h.excluidos ? v.excluido : !v.excluido) && filtroOk(v) && (!h.busca || (v.escolaNorm || normalizar(v.escola)).includes(normalizar(h.busca))))
    .sort((a, b) => b.chegadaMs - a.chegadaMs);
  const st = (v) => (v.excluido ? '<span class="status excl">Excluído</span>' : v.status === 'partiu' ? '<span class="status partiu">Partiu</span>' : '<span class="status ativo">Ativo</span>');
  const rotAcao = { cadastro: 'Cadastro', edicao: 'Edição', confirmacao_partida: 'Partida confirmada', exclusao: 'Exclusão', restauracao: 'Restauração', mapa_publicado: 'Mapa publicado', mapa_removido: 'Mapa retirado', datas_oficiais: 'Datas oficiais salvas', base_estudantes_publicada: 'Base de estudantes publicada' };
  const ind_ = (n, r, dest) => `<div class="indicador ${dest ? 'dest' : ''}"><strong>${n}</strong><small>${r}</small></div>`;
  return `
  <div class="rotulo" style="margin:4px 2px 8px">INDICADORES OFICIAIS DE VISITAÇÃO</div>
  <div class="indicadores">
    ${ind_(ind.visitas, 'Total de visitas (ônibus)', true)}${ind_(ind.escolas, 'Escolas distintas', true)}
    ${ind_(ind.estudantes, 'Estudantes visitantes')}${ind_(ind.professores, 'Professores acompanhantes')}
    ${ind_(ind.participacoes, 'Participações registradas nas visitas')}${ind_(ind.grupos, 'Total de grupos formados')}
  </div>
  <p style="font-size:12px;color:var(--cinza);margin:6px 2px 0">Participações somam estudantes e professores por visita; uma mesma pessoa em duas visitas conta duas vezes. Registros excluídos não entram nos totais.</p>

  <section class="cartao config-dias" style="margin-top:14px">
    <h3>CONFIGURAÇÃO OFICIAL: DIA 1 E DIA 2</h3>
    <p>Selecione as datas em que as escolas visitantes chegarão. Os relatórios Excel e Word e os turnos (Manhã/Tarde) serão gerados com base nestes dias.</p>
    ${[1, 2].map((n) => `
    <div class="dia-config">
      <div class="campo" style="margin:0"><label for="dia${n}">${n}º DIA DA MOSTRA (DIA ${n})</label><input id="dia${n}" type="date" value="${esc(d['dia' + n] || '')}"></div>
      <div class="contagens"><span class="chip amarelo">Manhã: ${d['dia' + n] ? conta(d['dia' + n], 'Manhã') : 0}</span><span class="chip">Tarde: ${d['dia' + n] ? conta(d['dia' + n], 'Tarde') : 0}</span></div>
    </div>`).join('')}
    <div class="atalhos" style="margin-top:10px">
      <button type="button" data-acao="atalho-datas" data-tipo="padrao">17/10 e 18/10 (Padrão)</button>
      <button type="button" data-acao="atalho-datas" data-tipo="hoje">Hoje e Amanhã</button>
    </div>
    <div class="status-datas">${E.datasRascunho ? '<span style="color:#8A5A0B">Alteração não salva.</span>' : E.datas?.confirmado ? `<span style="color:var(--verde)">Datas oficiais salvas: ${dataBR(E.datas.dia1)} e ${dataBR(E.datas.dia2)}.</span>` : '<span style="color:#8A5A0B">Datas de referência ainda não confirmadas pelo administrador.</span>'}</div>
    <button class="btn prim bloco" style="margin-top:10px" data-acao="salvar-datas">${icone('save')} SALVAR DATAS DO DIA 1 E DIA 2</button>
  </section>

  <section class="cartao relatorios">
    <div class="rotulo">Relatórios oficiais</div>
    <button class="btn verde bloco" data-acao="excel">${icone('file-spreadsheet')} BAIXAR RELATÓRIO EXCEL (.xlsx)</button>
    <button class="btn azul bloco" data-acao="word">${icone('file-text')} BAIXAR RELATÓRIO WORD (.docx)</button>
  </section>

  <section style="margin-top:14px" class="filtros">
    <div class="campo-busca">${icone('search')}<input id="h-busca" type="search" autocomplete="off" placeholder="Pesquisar histórico por escola..." value="${esc(h.busca)}"></div>
    <div class="campo" style="margin:0"><label class="sr" for="h-filtro">Período</label>
      <select id="h-filtro">
        ${[['todos', 'Todos os períodos'], ['d1m', 'Dia 1 — Manhã'], ['d1t', 'Dia 1 — Tarde'], ['d2m', 'Dia 2 — Manhã'], ['d2t', 'Dia 2 — Tarde'], ['outro', 'Outras datas']].map(([v, r]) => `<option value="${v}" ${h.filtro === v ? 'selected' : ''}>${r}</option>`).join('')}
      </select></div>
    <label class="check"><input type="checkbox" id="h-excl" ${h.excluidos ? 'checked' : ''}> VER EXCLUÍDOS</label>
  </section>
  <p class="contagem">${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}</p>
  <div class="pilha">
  ${lista.length ? lista.map((v) => `
    <article class="registro ${v.excluido ? 'excluido' : ''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h4>${esc(v.escola)}</h4>${st(v)}</div>
      <div class="linhas">
        <div><span class="k">Data</span><span>${dataBR(v.data)} (${diaSemana(v.data)})</span></div>
        <div><span class="k">Período</span><span>${esc(v.periodo)}</span></div>
        <div><span class="k">Chegada</span><span>${horaHHMM(v.chegadaMs)}</span></div>
        <div><span class="k">Saída prevista</span><span>${dataISO(v.saidaPrevistaMs) === v.data ? horaHHMM(v.saidaPrevistaMs) : dataHoraBR(v.saidaPrevistaMs)} (${v.minutos} min)</span></div>
        <div><span class="k">Partida efetiva</span><span>${v.partidaMs ? (dataISO(v.partidaMs) === v.data ? horaHHMM(v.partidaMs) : dataHoraBR(v.partidaMs)) : '—'}</span></div>
        <div><span class="k">Estudantes</span><span>${v.estudantes ?? '—'}</span></div>
        <div><span class="k">Professores</span><span>${v.professores ?? '—'}</span></div>
        <div><span class="k">Total geral</span><span>${v.estudantes == null && v.professores == null ? '—' : (v.estudantes || 0) + (v.professores || 0)}</span></div>
        <div><span class="k">Grupos formados</span><span>${v.totalGrupos ? `${v.totalGrupos} — ${esc(resumoGrupos(v.grupos))}` : '—'}${v.distribuicaoDetalhe ? ` · ${esc(v.distribuicaoDetalhe)}` : ''}</span></div>
        <div><span class="k">Observações</span><span>${esc(v.observacoes || '—')}</span></div>
      </div>
      <div class="acoes">
        ${v.excluido
          ? `<button class="btn sec p" data-acao="restaurar" data-id="${esc(v.id)}" style="grid-column:1/-1">${icone('rotate-ccw')} RESTAURAR</button>`
          : `<button class="btn sec p" data-acao="editar" data-id="${esc(v.id)}">${icone('pencil')} EDITAR</button><button class="btn perigo p" data-acao="excluir" data-id="${esc(v.id)}">${icone('trash-2')} EXCLUIR</button>`}
      </div>
    </article>`).join('') : `<div class="cartao vazio">${icone('history')}<strong>Nenhum registro</strong>${h.excluidos ? 'Não há registros excluídos com esses filtros.' : 'As visitas cadastradas aparecem aqui.'}</div>`}
  </div>

  <details class="cartao auditoria" style="margin-top:14px">
    <summary>${icone('scroll-text')} Histórico de auditoria (${E.auditoria.length})</summary>
    <ul>${E.auditoria.map((a) => `<li><b>${esc(rotAcao[a.acao] || a.acao)}</b>${a.escola ? ` · ${esc(a.escola)}` : ''}<br><span style="color:var(--cinza)">${dataHoraBR(a.emMs)} · ${esc(a.por || '')}</span></li>`).join('') || '<li>Nenhuma alteração registrada.</li>'}</ul>
  </details>`;
}

function depoisDeRenderAdmin() {
  if (E.ambiente !== 'admin') return;
  if (E.abaAdmin === 'historico') {
    const hb = document.getElementById('h-busca');
    hb?.addEventListener('input', () => { E.hist.busca = hb.value; const pos = hb.selectionStart; renderConteudo(); const n = document.getElementById('h-busca'); n.focus(); n.setSelectionRange(pos, pos); });
    document.getElementById('h-filtro')?.addEventListener('change', (e) => { E.hist.filtro = e.target.value; renderConteudo(); });
    document.getElementById('h-excl')?.addEventListener('change', (e) => { E.hist.excluidos = e.target.checked; renderConteudo(); });
    for (const n of [1, 2]) document.getElementById('dia' + n)?.addEventListener('change', (e) => {
      E.datasRascunho = { ...(E.datasRascunho || E.datas), ['dia' + n]: e.target.value }; renderConteudo();
    });
  }
  if (E.abaAdmin === 'mapa') {
    document.getElementById('m-arquivo')?.addEventListener('change', async (e) => {
      const arq = e.target.files[0]; if (!arq) return;
      try {
        toast('Otimizando imagem…');
        const { dataUrl, w, h } = await comprimirImagem(arq);
        if (!(await confirmar('Publicar mapa', `Publicar <b>${esc(arq.name)}</b> (${w}×${h} px) como mapa oficial para todos os guias?`, 'PUBLICAR'))) return;
        await store.publicarMapa({ src: dataUrl, nome: arq.name, origem: 'arquivo', largura: w, altura: h });
        toast('Mapa publicado para todos os guias.');
      } catch (err) { toast('Erro: ' + err.message, 5000); }
    });
  }
  verificarBaseRemota();
}

// Aviso de publicação da base (só no modo Firebase). Verificado uma vez por sessão administrativa.
const avisoBase = { verificado: false, html: '', arquivo: null };
function aplicarAvisoBase() {
  const alvo = document.getElementById('aviso-base');
  if (alvo && alvo.innerHTML !== avisoBase.html) { alvo.innerHTML = avisoBase.html; icones(); }
}
async function verificarBaseRemota(forcar = false) {
  if (store.modo !== 'firebase') return;
  if (avisoBase.verificado && !forcar) return aplicarAvisoBase();
  avisoBase.verificado = true;
  try {
    const [remota, arquivo] = await Promise.all([store.estadoBaseRemota(), carregarArquivoBase().catch(() => null)]);
    avisoBase.arquivo = arquivo;
    let html = '';
    if (!remota) html = `<div class="cartao" style="border:2px solid var(--amarelo);margin-bottom:10px"><div class="rotulo" style="color:var(--vinho)">Base de estudantes</div><p style="margin:6px 0 10px;font-size:14px">A base oficial ainda não está no Firebase. Os guias não conseguem pesquisar alunos até ela ser publicada.</p>`;
    else if (arquivo && arquivo.versao !== remota.versao) html = `<div class="cartao" style="margin-bottom:10px"><div class="rotulo">Base de estudantes</div><p style="margin:6px 0 10px;font-size:14px">Há uma versão diferente do arquivo da base (${esc(arquivo.versao)}) da que está publicada (${esc(remota.versao)}).</p>`;
    if (html) html += `<input type="file" id="arq-base" accept="application/json,.json" class="oculto">
        <button class="btn prim bloco" data-acao="publicar-base">${icone('database')} ${arquivo ? `PUBLICAR BASE OFICIAL (${arquivo.students.length} estudantes)` : 'ESCOLHER ARQUIVO DA BASE (.json)'}</button>
        <div class="progresso oculto"><div style="width:0"></div></div></div>`;
    avisoBase.html = html;
  } catch (e) {
    avisoBase.verificado = false;
    avisoBase.html = `<div class="cartao" style="margin-bottom:10px;color:#9B2C3F;font-size:14px">Não foi possível verificar a base no Firebase: ${esc(e.message)}</div>`;
  }
  aplicarAvisoBase();
}

async function publicarBase() {
  const alvo = document.getElementById('aviso-base');
  let json = avisoBase.arquivo;
  if (!json) {
    const inp = document.getElementById('arq-base');
    json = await new Promise((res) => { inp.onchange = async () => { try { res(JSON.parse(await inp.files[0].text())); } catch { res(null); } }; inp.click(); });
    if (!json?.students || !json?.student_presentations) return toast('Arquivo inválido: não é a base gerada pelo montar_base.mjs.', 5000);
  }
  if (!(await confirmar('Publicar base oficial', `Publicar <b>${json.students.length}</b> estudantes e <b>${json.student_presentations.length}</b> apresentações (versão ${esc(json.versao)}) no Firebase? Registros antigos que não estão no arquivo serão removidos.`, 'PUBLICAR'))) return;
  const barra = alvo.querySelector('.progresso'); barra.classList.remove('oculto');
  const bt = alvo.querySelector('[data-acao="publicar-base"]'); bt.disabled = true;
  try {
    await store.publicarBase(json, (f, t) => { barra.firstElementChild.style.width = `${Math.round((f / t) * 100)}%`; });
    toast('Base publicada. Os guias recebem a atualização automaticamente.', 4000);
    avisoBase.html = ''; aplicarAvisoBase();
  } catch (e) { bt.disabled = false; toast('Erro ao publicar: ' + e.message, 6000); }
}

// ════════════════════ AÇÕES ════════════════════
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-acao]');
  if (!el) return;
  const a = el.dataset.acao, id = el.dataset.id;
  switch (a) {
    case 'logo':
      if (E.ambiente === 'admin') { E.ambiente = 'guias'; render(); scrollTo(0, 0); }
      else if (store.adminAtivo()) { E.ambiente = 'admin'; ligarAdmin(); render(); scrollTo(0, 0); }
      else abrirPin();
      break;
    case 'aba': E.aba = el.dataset.aba; if (E.aba !== 'alunos') fecharFicha(false); render(); break;
    case 'limpar-busca': E.busca = ''; render(); document.getElementById('busca')?.focus(); break;
    case 'abrir-ficha': E.fichaId = id; history.pushState({ ficha: id }, ''); render(); irParaConteudo(); break;
    case 'voltar-pesquisa': fecharFicha(true); break;
    case 'ver-mapa': fecharFicha(false); E.aba = 'mapa'; render(); scrollTo(0, 0); break;
    case 'expandir-mapa': abrirVisor(); break;
    case 'notificacoes': ativarNotificacoes(); break;
    case 'fechar-alerta': alertasFechados.add(id); atualizarTimers(); break;
    case 'aba-admin': E.abaAdmin = el.dataset.aba; render(); break;
    case 'voltar-guias': E.ambiente = 'guias'; render(); scrollTo(0, 0); break;
    case 'sair-admin':
      if (await confirmar('Sair da administração', 'Encerrar a sessão administrativa neste aparelho?', 'SAIR')) {
        await store.sairAdmin(); E.ambiente = 'guias'; render(); toast('Sessão administrativa encerrada.');
      }
      break;
    case 'cadastrar': abrirFormVisita(); break;
    case 'editar': { const v = E.visitas.find((x) => x.id === id); if (v) abrirFormVisita(v); break; }
    case 'partida': {
      const v = E.visitas.find((x) => x.id === id); if (!v) break;
      if (await confirmar('Confirmar partida', `Confirmar que o ônibus da escola <b>${esc(v.escola)}</b> já partiu? O horário de agora (${horaHHMM(agora())}) será registrado como partida efetiva.`, 'SIM, O ÔNIBUS PARTIU')) {
        try { await store.confirmarPartida(id); toast('Partida confirmada. Visita enviada ao histórico.'); } catch (e) { toast('Erro: ' + e.message, 5000); }
      }
      break;
    }
    case 'excluir': {
      const v = E.visitas.find((x) => x.id === id); if (!v) break;
      if (await confirmar('Excluir registro', `Excluir a visita de <b>${esc(v.escola)}</b>? O registro sai dos totais oficiais, mas pode ser recuperado em "Ver excluídos".`, 'EXCLUIR', 'perigo')) {
        try { await store.excluirVisita(id); toast('Registro excluído (recuperável).'); } catch (e) { toast('Erro: ' + e.message, 5000); }
      }
      break;
    }
    case 'restaurar': try { await store.restaurarVisita(id); toast('Registro restaurado.'); } catch (e) { toast('Erro: ' + e.message, 5000); } break;
    case 'atalho-datas': {
      const hoje = dataISO(agora());
      const ano = hoje.slice(0, 4);
      E.datasRascunho = el.dataset.tipo === 'hoje' ? { dia1: hoje, dia2: somarDiasISO(hoje, 1) } : { dia1: `${ano}-10-17`, dia2: `${ano}-10-18` };
      renderConteudo(); toast('Datas preenchidas. Toque em SALVAR para confirmar.'); break;
    }
    case 'salvar-datas': {
      const d1 = document.getElementById('dia1').value, d2 = document.getElementById('dia2').value;
      if (!d1 || !d2) return toast('Preencha as duas datas.');
      if (d1 === d2) return toast('O Dia 1 e o Dia 2 precisam ser datas diferentes.');
      try { await store.salvarDatas(d1, d2); E.datasRascunho = null; toast('Datas oficiais salvas.'); } catch (e) { toast('Erro: ' + e.message, 5000); }
      break;
    }
    case 'excel': case 'word': {
      el.disabled = true; const orig = el.innerHTML; el.innerHTML = '<span class="spinner p claro"></span> Gerando…';
      try {
        const r = await import('./relatorios.js');
        await (a === 'excel' ? r.baixarExcel : r.baixarWord)(E.visitas.filter((v) => !v.excluido), E.datas, indicadores(E.visitas));
        toast('Relatório gerado.');
      } catch (e) { toast('Erro ao gerar o relatório: ' + e.message, 6000); }
      el.disabled = false; el.innerHTML = orig; icones(); break;
    }
    case 'publicar-mapa-url': {
      const url = document.getElementById('m-url').value.trim();
      if (!/^https:\/\//i.test(url)) return toast('Informe um link que comece com https://');
      el.disabled = true;
      try {
        const { w, h } = await testarImagem(url);
        if (await confirmar('Publicar mapa', `Imagem carregada com sucesso (${w}×${h} px). Publicar como mapa oficial para todos os guias?`, 'PUBLICAR')) {
          await store.publicarMapa({ src: url, nome: 'Mapa oficial (link)', origem: 'url', largura: w, altura: h });
          toast('Mapa publicado para todos os guias.');
        }
      } catch (e) { toast('Erro: ' + e.message, 5000); }
      el.disabled = false; break;
    }
    case 'escolher-arquivo-mapa': document.getElementById('m-arquivo').click(); break;
    case 'remover-mapa':
      if (await confirmar('Voltar ao mapa oficial', 'Os guias voltarão a ver o mapa oficial fornecido pela coordenação. Continuar?', 'VOLTAR AO OFICIAL', 'perigo')) {
        try { await store.removerMapa(); toast('Mapa oficial restaurado.'); } catch (e) { toast('Erro: ' + e.message, 5000); }
      }
      break;
    case 'publicar-base': publicarBase(); break;
    default: break;
  }
});

// Leva a tela para o início do conteúdo (logo abaixo das abas), sem esconder o botão de voltar.
function irParaConteudo() {
  const c = document.getElementById('conteudo');
  if (c) scrollTo(0, Math.max(0, c.getBoundingClientRect().top + scrollY - (document.querySelector('.abas')?.offsetHeight || 0) - 8));
}

// A ficha ocupa uma entrada do histórico, para o "voltar" do celular também retornar à pesquisa.
let ignorarPopstate = false;
function fecharFicha(voltarPesquisa) {
  if (!E.fichaId) return;
  E.fichaId = null;
  if (!voltarPesquisa) return;
  render(); irParaConteudo();
  if (history.state?.ficha) { ignorarPopstate = true; history.back(); }
}
window.addEventListener('popstate', () => {
  if (ignorarPopstate) { ignorarPopstate = false; return; }
  if (E.fichaId) { E.fichaId = null; render(); irParaConteudo(); }
});

// ════════════════════ INÍCIO ════════════════════
async function iniciar() {
  E.mapa = MAPA_PADRAO;
  sincronizarRelogio().then(() => atualizarTimers());
  try {
    await store.iniciar();
  } catch (e) {
    $app.innerHTML = `${cabecalho()}<div class="cartao vazio">${icone('wifi-off')}<strong>Não foi possível conectar ao Firebase</strong>${esc(e.message)}<br><br><button class="btn prim" onclick="location.reload()">Tentar novamente</button></div>`;
    icones(); return;
  }
  store.aoMudarStatus = (st) => {
    const el = document.getElementById('status-conexao');
    if (el) { el.textContent = st.texto; el.previousElementSibling.className = `ponto ${st.ok ? 'ok' : 'erro'}`; }
  };
  store.ouvirBase((b) => {
    if (b.erro) { E.baseErro = b.erro; } else { E.baseErro = null; E.base = b; montarIndice(b); }
    if (E.ambiente === 'guias' && E.aba === 'alunos') {
      if (E.fichaId) renderConteudo(); else render();
    }
  });
  store.ouvirVisitas((l) => { E.visitas = l || []; renderConteudo(); atualizarTimers(); });
  store.ouvirMapa((m) => { E.mapa = m && m.src ? m : MAPA_PADRAO; if ((E.ambiente === 'guias' && E.aba === 'mapa') || (E.ambiente === 'admin' && E.abaAdmin === 'mapa')) renderConteudo(); });
  store.ouvirDatas((d) => { E.datas = d; if (E.ambiente === 'admin' && E.abaAdmin === 'historico') renderConteudo(); });
  if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
  setInterval(atualizarTimers, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { sincronizarRelogio(); atualizarTimers(); } });
}

if (!FIREBASE_CONFIG) console.info('Central dos Guias: PRÉVIA LOCAL (FIREBASE_CONFIG não preenchido em js/config.js).');
iniciar();
