import { FUSO } from './config.js';

export const normalizar = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icone = (nome, cls = '') => `<i data-lucide="${nome}" class="ic ${cls}" aria-hidden="true"></i>`;

// ── Relógio ──────────────────────────────────────────────
// Diferença entre o relógio do servidor (cabeçalho Date da hospedagem) e o do aparelho.
let deslocamento = 0;
let relogioSincronizado = false;
export async function sincronizarRelogio() {
  try {
    const t0 = Date.now();
    const r = await fetch(location.href.split('#')[0], { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const d = r.headers.get('date');
    if (d) {
      deslocamento = new Date(d).getTime() + 500 - (t0 + t1) / 2; // cabeçalho tem resolução de 1 s
      relogioSincronizado = true;
    }
  } catch { /* mantém o relógio do aparelho */ }
  return relogioSincronizado;
}
export const agora = () => Math.round(Date.now() + deslocamento);
export const relogioConfiavel = () => relogioSincronizado;

// ── Fuso America/Bahia ───────────────────────────────────
const fmtPartes = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
export function partes(ms) {
  const p = Object.fromEntries(fmtPartes.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, min: +p.minute, seg: +p.second };
}
const pad = (n) => String(n).padStart(2, '0');
export const dataISO = (ms) => { const p = partes(ms); return `${p.ano}-${pad(p.mes)}-${pad(p.dia)}`; };
export const horaHHMM = (ms) => { if (ms == null) return '—'; const p = partes(ms); return `${pad(p.hora)}:${pad(p.min)}`; };
export const dataBR = (iso) => { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
export const dataHoraBR = (ms) => (ms == null ? '—' : `${dataBR(dataISO(ms))} ${horaHHMM(ms)}`);

// Converte data + hora "de parede" na Bahia para epoch (ms).
export function bahiaParaMs(iso, hhmm) {
  const [a, m, d] = iso.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const palpite = Date.UTC(a, m - 1, d, h, mi);
  const p = partes(palpite);
  const comoUTC = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.min, p.seg);
  return palpite - (comoUTC - palpite);
}
export const somarDiasISO = (iso, n) => dataISO(bahiaParaMs(iso, '12:00') + n * 86400000);

export const periodoDe = (ms) => (partes(ms).hora < 12 ? 'Manhã' : 'Tarde');

export function cronometro(msRestante) {
  const s = Math.max(0, Math.floor(msRestante / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export function diaSemana(iso) { const [a, m, d] = iso.split('-').map(Number); return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]; }

// "22/10" da base de estudantes → rótulo com dia da semana (ano do evento)
export function rotuloDiaEvento(ddmm, ano = 2026) {
  if (!ddmm) return 'Dia não informado';
  const [d, m] = ddmm.split('/');
  return `${diaSemana(`${ano}-${m}-${d}`)}, ${ddmm}`;
}

export const inteiroOuNulo = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

export function resumoGrupos(linhas) {
  const validas = (linhas || []).filter((l) => l.qtd > 0);
  if (!validas.length) return '';
  return validas.map((l) => `${l.qtd} ${l.qtd === 1 ? 'grupo' : 'grupos'}${l.tamanho ? ` de ${l.tamanho} ${l.tamanho === 1 ? 'estudante' : 'estudantes'}` : ''}`).join(' + ');
}
export const totalGrupos = (linhas) => (linhas || []).reduce((s, l) => s + (l.qtd > 0 ? l.qtd : 0), 0);

export function novoId(prefixo = 'v') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefixo}${Date.now().toString(36)}${r[0].toString(36)}${r[1].toString(36)}`.slice(0, 24);
}
