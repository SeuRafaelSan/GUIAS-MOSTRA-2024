// Consolida ferramentas/fontes_oficiais.js em public/dados_privados/base_oficial_estudantes.json.
// Uso: node ferramentas/montar_base.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS } from './fontes_oficiais.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSAO = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const nomeProprio = (s) => (/[a-zà-ú]/.test(s) ? s : s.toLowerCase().split(/\s+/)
  .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' '));

export const normalizar = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => normalizar(s).replace(/ /g, '-');
const compactar = (s) => normalizar(s).replace(/ /g, '');

function formatarTurma(t) {
  t = (t || '').trim();
  const m = t.match(/^(\d)\s*[º°o]?\s*([A-Da-d])?(?:\b|(?=[A-Z]))\s*[-–]?\s*(.*)$/);
  if (!m) return { turma: t, serie: '' };
  const resto = m[3].trim();
  return { turma: `${m[1]}º${m[2] ? ' ' + m[2].toUpperCase() : ''}${resto ? ' ' + resto : ''}`, serie: m[1] };
}

const DIAS = { '22': '22/10', '23': '23/10', '?': '' };
const TURNOS = { M: 'Manhã', T: 'Tarde', '?': '' };

// divide por ";" ignorando o que está entre parênteses
function dividirSessoes(txt) {
  const partes = []; let atual = '', nivel = 0;
  for (const c of txt) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ';' && nivel === 0) { partes.push(atual); atual = ''; } else atual += c;
  }
  partes.push(atual);
  return partes.map((p) => p.trim()).filter(Boolean);
}

function lerSessoes(txt, contexto) {
  const out = [];
  for (const parte of dividirSessoes(txt)) {
    const m = parte.match(/^(22\+23|22|23|\?)\s+(M\+T|M|T|\?)(?:\s+(\d{2}:\d{2})-(\d{2}:\d{2}))?(?:\s+\((.+)\))?$/);
    if (!m) throw new Error(`Sessão inválida "${parte}" em ${contexto}`);
    const dias = m[1] === '22+23' ? ['22', '23'] : [m[1]];
    const turnos = m[2] === 'M+T' ? ['M', 'T'] : [m[2]];
    for (const d of dias) for (const t of turnos) {
      out.push({ dia: DIAS[d], turno: TURNOS[t], horario: m[3] ? `${m[3]}–${m[4]}` : '', nota: m[5] || '' });
    }
  }
  return out;
}

const ORDEM_TURNO = { 'Manhã': 0, 'Tarde': 1, '': 2 };
const ordenarSessoes = (a, b) => (a.dia || '9').localeCompare(b.dia || '9')
  || ORDEM_TURNO[a.turno] - ORDEM_TURNO[b.turno] || a.horario.localeCompare(b.horario);

const estudantes = new Map();
const apresentacoes = new Map();
const avisos = [];

for (const area of AREAS) {
  for (const g of area.grupos) {
    const linhas = g.alunos.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const linha of linhas) {
      const [nomeBruto, turmaBruta = '', sessTxt = '', obs = '', conf = '', apelidos = ''] = linha.split('|').map((x) => x.trim());
      const nome = nomeProprio(nomeBruto);
      const { turma, serie } = formatarTurma(turmaBruta);
      const chave = `${normalizar(nome)}|${serie || '?'}`;
      let est = estudantes.get(chave);
      if (!est) {
        const segmento = serie ? (Number(serie) <= 3 ? 'Ensino Médio' : 'Ensino Fundamental') : (area.segmento || '');
        est = { id: `${slug(nome)}-${serie || 'st'}`, nome, aliases: [], turmas: [], serie, segmento, obs: [] };
        estudantes.set(chave, est);
      }
      if (turma && !est.turmas.some((t) => compactar(t) === compactar(turma))) {
        const i = est.turmas.findIndex((t) => compactar(turma).startsWith(compactar(t)) || compactar(t).startsWith(compactar(turma)));
        if (i >= 0) { if (turma.length > est.turmas[i].length) est.turmas[i] = turma; } else est.turmas.push(turma);
      }
      for (const a of apelidos.split(',').map((x) => x.trim()).filter(Boolean)) if (!est.aliases.includes(a)) est.aliases.push(a);

      const projeto = g.projeto || area.projetoPadrao || '';
      const subgrupo = g.subgrupo || '';
      const local = g.local !== undefined ? g.local : area.local;
      const chaveAp = [est.id, area.oficina, projeto, subgrupo, local].join('|');
      let ap = apresentacoes.get(chaveAp);
      if (!ap) {
        ap = {
          id: `${est.id}--${apresentacoes.size + 1}`, studentId: est.id, oficina: area.oficina,
          segmento: area.segmento || est.segmento, projeto, subgrupo, local, bloco: area.bloco || '',
          responsaveis: g.responsaveis || area.responsaveis || '', sessoes: [], obs: [],
          conf: conf || g.conf || area.conf || 'oficial', turmaFonte: turma, fonte: area.fonte,
        };
        for (const o of [area.obs, g.obs]) if (o) ap.obs.push(o);
        apresentacoes.set(chaveAp, ap);
      } else if (conf && conf !== ap.conf) ap.conf = conf;
      if (obs && !ap.obs.includes(obs)) ap.obs.push(obs);
      for (const s of lerSessoes(sessTxt, linha)) {
        if (!ap.sessoes.some((x) => x.dia === s.dia && x.turno === s.turno && x.horario === s.horario && x.nota === s.nota)) ap.sessoes.push(s);
      }
      ap.sessoes.sort(ordenarSessoes);
    }
  }
}

const listaEst = [...estudantes.values()].map((e) => {
  const aps = [...apresentacoes.values()].filter((a) => a.studentId === e.id);
  if (e.turmas.length > 1) avisos.push(`Turmas divergentes para ${e.nome}: ${e.turmas.join(' / ')}`);
  return {
    id: e.id, nome: e.nome, aliases: e.aliases, turma: e.turmas.join(' / '), serie: e.serie,
    serieTexto: e.serie ? `${e.serie}º ano` : '', segmento: e.segmento,
    oficinas: [...new Set(aps.map((a) => a.oficina))], obs: e.obs,
    busca: normalizar([e.nome, ...e.aliases].join(' ')),
  };
}).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

const ids = new Set();
for (const e of listaEst) { if (ids.has(e.id)) throw new Error('ID duplicado ' + e.id); ids.add(e.id); }

const saida = {
  versao: VERSAO,
  geradoEm: new Date().toISOString(),
  fontes: [...new Set(AREAS.map((a) => a.fonte))],
  students: listaEst,
  student_presentations: [...apresentacoes.values()],
};
mkdirSync(join(RAIZ, 'public', 'dados_privados'), { recursive: true });
writeFileSync(join(RAIZ, 'public', 'dados_privados', 'base_oficial_estudantes.json'), JSON.stringify(saida));

const multi = listaEst.filter((e) => e.oficinas.length > 1 || [...apresentacoes.values()].filter((a) => a.studentId === e.id).length > 1);
console.log(`Versão ${VERSAO}`);
console.log(`Estudantes: ${listaEst.length} | Apresentações: ${apresentacoes.size}`);
const porOficina = {};
for (const a of apresentacoes.values()) porOficina[a.oficina + ' / ' + a.segmento] = (porOficina[a.oficina + ' / ' + a.segmento] || 0) + 1;
console.table(porOficina);
console.log('\nEm mais de uma oficina:');
for (const e of listaEst.filter((x) => x.oficinas.length > 1)) console.log(`  ${e.nome} (${e.turma}) → ${e.oficinas.join(' + ')}`);
console.log(`\nCom mais de uma apresentação: ${multi.length}`);
console.log('\nAvisos:'); avisos.forEach((a) => console.log('  ' + a));
