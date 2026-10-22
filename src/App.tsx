import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Bus, Map, Search, X, ChevronRight, UserRound, MapPin, 
  CalendarDays, Calendar, Info, Layers, Bell, BellRing, BellOff, 
  Maximize2, ZoomIn, ZoomOut, LocateFixed, TriangleAlert, ShieldCheck, 
  Plus, CirclePlus, CircleCheck, Pencil, Trash2, RotateCcw, Save, 
  Clock, ImagePlus, History, ScrollText, FileSpreadsheet, FileText, 
  Sunrise, Sunset, Layers as LayersIcon, LockKeyholeOpen, Database, FlaskConical, LogOut
} from 'lucide-react';
import ExcelJS from 'exceljs';
import * as Docx from 'docx';

// --- CONFIG & CONSTANTS ---
const LOGO_URL = 'https://i.postimg.cc/YCFTHPcv/Whats-App-Image-2026-10-21-at-22-28-34.jpg';
const MAPA_OFICIAL_URL = 'https://i.postimg.cc/QdqwCTtc/39b0d1ef-0c2c-47ea-b7dd-b23072998f7f.jpg';
const ESCOLA_NOME = 'SESI João Ubaldo Ribeiro';
const ADMIN_NOME = 'Guilherme Delfino';
const PIN_CORRETO = '1234567'; // Default PIN for preview mode
const PIN_DIGITOS = 7;
const SESSAO_ADMIN_HORAS = 12;

const DATAS_REFERENCIA_DEFAULT = { dia1: '2026-10-22', dia2: '2026-10-23', confirmado: false };

const PROFESSORES_EXTRAS = [
  { nome: 'Adenilsa', local: 'Sala de Robótica', oficina: 'Oficina de Robótica', obs: 'Oficina distinta das equipes oficiais do professor Gotardo.', fonte: 'Mapa oficial da Mostra' },
  { nome: 'Gotardo', local: 'Laboratório de Robótica', oficina: 'Robótica Educacional', obs: 'Equipes oficiais de robótica.', fonte: 'Mapa oficial da Mostra' },
  { nome: 'Carolina', local: 'Espaço Maker', oficina: 'Maker e Impressão 3D', obs: '', fonte: 'Mapa oficial' },
  { nome: 'Gislane', local: 'Pátio Central', oficina: 'Energias Renováveis', obs: '', fonte: 'Mapa oficial' }
];

// --- UTILS ---
const normalizar = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const pad = (n: number) => String(n).padStart(2, '0');

const agora = () => Date.now();

const dataISO = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const horaHHMM = (ms: number | null) => {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dataBR = (iso: string) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

const dataHoraBR = (ms: number | null) => (ms == null ? '—' : `${dataBR(dataISO(ms))} ${horaHHMM(ms)}`);

const bahiaParaMs = (iso: string, hhmm: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return Date.UTC(a, m - 1, d, h, mi);
};

const somarDiasISO = (iso: string, n: number) => {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

const periodoDe = (ms: number) => (new Date(ms).getHours() < 12 ? 'Manhã' : 'Tarde');

const cronometro = (msRestante: number) => {
  const s = Math.max(0, Math.floor(msRestante / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const diaSemana = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
};

const rotuloDiaEvento = (ddmm: string) => {
  if (!ddmm) return 'Dia não informado';
  const [d, m] = ddmm.split('/');
  return `${diaSemana(`2026-${m}-${d}`)}, ${ddmm}`;
};

const inteiroOuNulo = (v: any) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

const resumoGrupos = (linhas: any[]) => {
  const validas = (linhas || []).filter((l) => l.qtd > 0);
  if (!validas.length) return '';
  return validas.map((l) => `${l.qtd} ${l.qtd === 1 ? 'grupo' : 'grupos'}${l.tamanho ? ` de ${l.tamanho} ${l.tamanho === 1 ? 'estudante' : 'estudantes'}` : ''}`).join(' + ');
};

const totalGrupos = (linhas: any[]) => (linhas || []).reduce((s, l) => s + (l.qtd > 0 ? l.qtd : 0), 0);

const novoId = (prefixo = 'v') => `${prefixo}${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;

export function App() {
  const [ambiente, setAmbiente] = useState<'guias' | 'admin'>('guias');
  const [aba, setAba] = useState<'alunos' | 'onibus' | 'mapa'>('alunos');
  const [abaAdmin, setAbaAdmin] = useState<'onibus' | 'mapa' | 'historico'>('onibus');
  
  const [base, setBase] = useState<any>(null);
  const [baseErro, setBaseErro] = useState<string | null>(null);
  const [busca, setBusca] = useState<string>('');
  const [fichaId, setFichaId] = useState<string | null>(null);

  const [visitas, setVisitas] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('cg_visitas');
      return saved ? JSON.parse(saved) : [
        {
          id: 'v1',
          escola: 'Escola Municipal Paulo Freire',
          escolaNorm: 'escola municipal paulo freire',
          data: '2026-10-22',
          periodo: 'Manhã',
          chegadaMs: Date.now() - 30 * 60 * 1000,
          minutos: 90,
          saidaPrevistaMs: Date.now() + 60 * 60 * 1000,
          estudantes: 45,
          professores: 3,
          grupos: [{ qtd: 3, tamanho: 15 }],
          totalGrupos: 3,
          distribuicaoDetalhe: 'Grupos 1 a 3 com guias Ana e Bruno',
          observacoes: 'Chegada pontual. Acompanhar pelo Bloco A.',
          status: 'ativo',
          partidaMs: null,
          excluido: false
        }
      ];
    } catch {
      return [];
    }
  });

  const [mapa, setMapa] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('cg_mapa');
      return saved ? JSON.parse(saved) : { src: MAPA_OFICIAL_URL, nome: 'Mapa oficial da Mostra (coordenação)', padrao: true };
    } catch {
      return { src: MAPA_OFICIAL_URL, nome: 'Mapa oficial da Mostra (coordenação)', padrao: true };
    }
  });

  const [datas, setDatas] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('cg_datas');
      return saved ? JSON.parse(saved) : DATAS_REFERENCIA_DEFAULT;
    } catch {
      return DATAS_REFERENCIA_DEFAULT;
    }
  });

  const [auditoria, setAuditoria] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('cg_auditoria');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [adminLogado, setAdminLogado] = useState<boolean>(() => {
    try {
      const ate = Number(localStorage.getItem('cg_admin_ate') || 0);
      return ate > Date.now();
    } catch {
      return false;
    }
  });

  // Modal states
  const [modalType, setModalType] = useState<string | null>(null); // 'pin', 'visita', 'confirm', 'visor'
  const [modalData, setModalData] = useState<any>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [alertasFechados, setAlertasFechados] = useState<Set<string>>(new Set());

  // Histórico state in admin
  const [hist, setHist] = useState({ busca: '', filtro: 'todos', excluidos: false });
  const [datasRascunho, setDatasRascunho] = useState<any>(null);

  // Load base JSON
  useEffect(() => {
    fetch('./dados_privados/base_oficial_estudantes.json')
      .then(res => {
        if (!res.ok) throw new Error(`Arquivo da base não encontrado (${res.status}).`);
        return res.json();
      })
      .then(data => setBase(data))
      .catch(err => setBaseErro(err.message));
  }, []);

  // Sync localStorage
  useEffect(() => {
    try { localStorage.setItem('cg_visitas', JSON.stringify(visitas)); } catch {}
  }, [visitas]);

  useEffect(() => {
    try { localStorage.setItem('cg_mapa', JSON.stringify(mapa)); } catch {}
  }, [mapa]);

  useEffect(() => {
    try { localStorage.setItem('cg_datas', JSON.stringify(datas)); } catch {}
  }, [datas]);

  useEffect(() => {
    try { localStorage.setItem('cg_auditoria', JSON.stringify(auditoria)); } catch {}
  }, [auditoria]);

  // Timer interval for bus countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const auditar = (acao: string, visita: any = null, antes: any = null, depois: any = null) => {
    const novo = {
      id: novoId('a'),
      acao,
      visitaId: visita?.id || null,
      escola: visita?.escola || '',
      antes: antes ? JSON.parse(JSON.stringify(antes)) : null,
      depois: depois ? JSON.parse(JSON.stringify(depois)) : null,
      por: 'Administrador (Prévia)',
      emMs: agora()
    };
    setAuditoria(prev => [...prev.slice(-300), novo]);
  };

  // Student search indexes
  const alunoPorId = React.useMemo(() => {
    if (!base?.students) return new Map();
    return new Map(base.students.map((s: any) => [s.id, s]));
  }, [base]);

  const apsPorAluno = React.useMemo(() => {
    if (!base?.student_presentations) return new Map();
    const map = new Map();
    for (const p of base.student_presentations) {
      if (!map.has(p.studentId)) map.set(p.studentId, []);
      map.get(p.studentId).push(p);
    }
    return map;
  }, [base]);

  const professores = React.useMemo(() => {
    if (!base?.student_presentations) return PROFESSORES_EXTRAS.map(p => ({
      nome: p.nome,
      busca: normalizar(p.nome),
      lugares: [{ local: p.local, bloco: '', oficinas: new Set([p.oficina]), segmentos: new Set(), grupos: 0, obs: p.obs, fonte: p.fonte }]
    }));

    const APELIDOS_PROF: any = { carol: 'carolina', 'riane maria': 'riane', gislaine: 'gislane', gislene: 'gislane', gedinilsa: 'gednilsa', filipe: 'felipe' };
    const chaveProf = (nome: string) => {
      const n = normalizar(nome.replace(/\(.*?\)/g, ''));
      return APELIDOS_PROF[n] || n;
    };

    const mapa = new Map();
    const adicionar = (nome: string, lugar: any) => {
      const k = chaveProf(nome);
      if (!k) return;
      const prof = mapa.get(k) || { nomes: new Set(), lugares: new Map() };
      prof.nomes.add(nome.trim());
      const kl = [lugar.local, lugar.bloco].join('|');
      if (!prof.lugares.has(kl)) {
        prof.lugares.set(kl, { local: lugar.local, bloco: lugar.bloco, oficinas: new Set(), segmentos: new Set(), grupos: 0, obs: lugar.obs, fonte: lugar.fonte });
      }
      const l = prof.lugares.get(kl);
      l.oficinas.add(lugar.oficina);
      if (lugar.segmento) l.segmentos.add(lugar.segmento);
      l.grupos += lugar.conta ? 1 : 0;
      mapa.set(k, prof);
    };

    const vistos = new Set();
    for (const p of base.student_presentations) {
      if (!p.local || !p.responsaveis) continue;
      const grupo = [p.oficina, p.projeto, p.subgrupo, p.local].join('|');
      for (const nome of p.responsaveis.replace(/ e /g, ',').split(',').map((x: string) => x.trim()).filter(Boolean)) {
        const novoGrupo = !vistos.has(nome + grupo);
        vistos.add(nome + grupo);
        adicionar(nome, { local: p.local, bloco: p.bloco || '', oficina: p.oficina, segmento: p.segmento || '', conta: novoGrupo });
      }
    }
    for (const x of PROFESSORES_EXTRAS) {
      adicionar(x.nome, { local: x.local, bloco: x.bloco || '', oficina: x.oficina, segmento: '', obs: x.obs, fonte: x.fonte, conta: false });
    }

    return [...mapa.entries()].map(([k, p]: [string, any]) => {
      const nomes = [...p.nomes].sort((a: string, b: string) => b.length - a.length);
      return {
        nome: nomes[0],
        busca: normalizar([...nomes, k, ...Object.keys(APELIDOS_PROF).filter((a) => APELIDOS_PROF[a] === k)].join(' ')),
        lugares: [...p.lugares.values()].map((l: any) => ({
          ...l,
          oficinas: [...l.oficinas],
          segmentos: [...l.segmentos]
        }))
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [base]);

  const consultaProfessor = (q: string) => {
    const t = normalizar(q).split(' ').filter(Boolean);
    const p = t[0] || '';
    const ehProf = p.length >= 4 && (['professores', 'professoras'].some((w) => w.startsWith(p)) || ['profa', 'profs'].includes(p));
    return ehProf ? t.slice(1) : null;
  };

  const buscarEstudantes = (q: string) => {
    const nq = normalizar(q);
    if (!nq || !base?.students) return [];
    const tokens = nq.split(' ');
    const out = [];
    for (const s of base.students) {
      const itBusca = s.busca || normalizar([s.nome, ...(s.aliases || [])].join(' '));
      if (!tokens.every((t: string) => itBusca.includes(t))) continue;
      const palavras = itBusca.split(' ');
      const score = itBusca.startsWith(nq) ? 0 : tokens.every((t: string) => palavras.some((p: string) => p.startsWith(t))) ? 1 : 2;
      out.push({ s, score });
    }
    return out.sort((a, b) => a.score - b.score || a.s.nome.localeCompare(b.s.nome, 'pt-BR')).map((x) => x.s);
  };

  const destacarNome = (nome: string, q: string) => {
    const tokens = normalizar(q).split(' ').filter(Boolean);
    if (!tokens.length) return nome;
    // Simple bold/highlight match
    return nome;
  };

  const visitasAtivas = visitas.filter((v: any) => !v.excluido && v.status === 'ativo')
    .sort((a: any, b: any) => a.saidaPrevistaMs - b.saidaPrevistaMs);

  const vencidas = visitasAtivas.filter((v: any) => v.saidaPrevistaMs <= agora());
  const visiveisAlertas = vencidas.filter((v: any) => !alertasFechados.has(v.id));

  // --- RENDER SUB-VIEWS ---

  return (
    <div className="app">
      {/* Top Header */}
      <header className="cabecalho">
        <button 
          className="logo-btn" 
          onClick={() => {
            if (ambiente === 'admin') {
              setAmbiente('guias');
            } else if (adminLogado) {
              setAmbiente('admin');
            } else {
              setModalType('pin');
            }
          }}
          aria-label={ambiente === 'admin' ? 'Voltar ao ambiente dos guias' : 'Acesso administrativo'}
        >
          <img src={LOGO_URL} alt="Logo da Mostra SESI STEAM 2026" width="92" height="92" />
        </button>
        <h1>Central dos Guias</h1>
        <p className="sub">Mostra SESI STEAM 2026</p>
        <p className="escola">{ESCOLA_NOME}</p>
        {ambiente === 'admin' && (
          <span className="selo-admin"><ShieldCheck className="ic" /> Administração · {ADMIN_NOME}</span>
        )}
        <div className="faixa-previa">
          <FlaskConical className="ic" />
          <span><b>Modo React Preview.</b> Dados salvos neste navegador.</span>
        </div>
      </header>

      {/* Alertas Flutuantes */}
      {visiveisAlertas.length > 0 && ambiente === 'guias' && (
        <div className="alertas" aria-live="assertive">
          {visiveisAlertas.map(v => (
            <div key={v.id} className="alerta" role="alert">
              <TriangleAlert className="ic-alerta" />
              <div>
                <strong>ATENÇÃO: A escola <em>{v.escola}</em> está no horário de saída!</strong>
                <p>Aguardando confirmação de partida.</p>
              </div>
              <button 
                className="fechar" 
                onClick={() => setAlertasFechados(prev => new Set(prev).add(v.id))} 
                aria-label="Fechar aviso"
              >
                <X className="ic" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Abas / Nav */}
      {ambiente === 'guias' ? (
        <>
          <nav className="abas" aria-label="Seções">
            <button 
              className={`aba ${aba === 'alunos' ? 'ativa' : ''}`} 
              onClick={() => { setAba('alunos'); setFichaId(null); }}
              aria-pressed={aba === 'alunos'}
            >
              <Bot className="ic" />
              <span>ALUNOS</span>
            </button>
            <button 
              className={`aba ${aba === 'onibus' ? 'ativa' : ''}`} 
              onClick={() => { setAba('onibus'); setFichaId(null); }}
              aria-pressed={aba === 'onibus'}
            >
              <Bus className="ic" />
              <span>ÔNIBUS</span>
              {visitasAtivas.length > 0 && <span className="contador">{visitasAtivas.length}</span>}
            </button>
            <button 
              className={`aba ${aba === 'mapa' ? 'ativa' : ''}`} 
              onClick={() => { setAba('mapa'); setFichaId(null); }}
              aria-pressed={aba === 'mapa'}
            >
              <Map className="ic" />
              <span>MAPA</span>
            </button>
          </nav>

          <main className="tela">
            {aba === 'alunos' && (
              fichaId ? renderFicha(fichaId, setFichaId, setAba, alunoPorId, apsPorAluno) : renderAlunos(base, baseErro, busca, setBusca, setFichaId, professores, consultaProfessor, buscarEstudantes)
            )}
            {aba === 'onibus' && renderOnibus(visitasAtivas, showToast)}
            {aba === 'mapa' && renderMapa(mapa, setModalType)}
          </main>
        </>
      ) : (
        <>
          <div className="acoes-admin">
            <button className="btn sec" onClick={() => setAmbiente('guias')}><ArrowLeft className="ic" /> VOLTAR AOS GUIAS</button>
            <button className="btn sec icone" onClick={() => { setAdminLogado(false); localStorage.removeItem('cg_admin_ate'); setAmbiente('guias'); showToast('Sessão encerrada.'); }} aria-label="Sair da administração"><LogOut className="ic" /></button>
          </div>
          <nav className="abas-admin" aria-label="Administração">
            <button className={`aba ${abaAdmin === 'onibus' ? 'ativa' : ''}`} onClick={() => setAbaAdmin('onibus')}><Bus className="ic" /><span>1. ÔNIBUS</span></button>
            <button className={`aba ${abaAdmin === 'mapa' ? 'ativa' : ''}`} onClick={() => setAbaAdmin('mapa')}><Map className="ic" /><span>2. MAPA</span></button>
            <button className={`aba ${abaAdmin === 'historico' ? 'ativa' : ''}`} onClick={() => setAbaAdmin('historico')}><History className="ic" /><span>3. HISTÓRICO</span></button>
          </nav>
          <main className="tela">
            {abaAdmin === 'onibus' && renderAdminOnibus(visitasAtivas, setModalType, visitas)}
            {abaAdmin === 'mapa' && renderAdminMapa(mapa, setMapa, showToast, auditar)}
            {abaAdmin === 'historico' && renderAdminHistorico(visitas, datas, setDatas, auditoria, hist, setHist, datasRascunho, setDatasRascunho, setModalType, showToast)}
          </main>
        </>
      )}

      {/* MODALS */}
      {modalType === 'pin' && (
        renderPinModal(setModalType, setAdminLogado, setAmbiente, showToast)
      )}
      {modalType === 'visita' && (
        renderVisitaModal(modalData, setModalType, setVisitas, showToast, auditar)
      )}
      {modalType === 'visor' && (
        renderVisorModal(mapa, setModalType)
      )}

      {/* TOAST */}
      <div id="toast" className={`toast ${toastMsg ? 'on' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </div>
  );
}

// --- SUB-RENDER HELPERS ---

function renderAlunos(base: any, baseErro: string | null, busca: string, setBusca: (b: string) => void, setFichaId: (id: string | null) => void, professores: any[], consultaProfessor: any, buscarEstudantes: any) {
  let estado = null;
  if (baseErro) estado = <div className="cartao vazio"><TriangleAlert className="ic" /><strong>Não foi possível carregar a base</strong>{baseErro}</div>;
  else if (!base) estado = <div className="cartao vazio"><div className="spinner" style={{ margin: '0 auto 10px' }}></div>Carregando a base oficial...</div>;
  else if (base.vazia) estado = <div className="cartao vazio"><Database className="ic" /><strong>Base vazia</strong></div>;

  const termosProf = consultaProfessor(busca);
  const resultados = termosProf ? [] : buscarEstudantes(busca);

  return (
    <div>
      <h2 className="titulo-tela">Localização de Estudantes</h2>
      <div className="instrucao"><Megaphone className="ic" /><span>Guia, digite aqui o nome completo do aluno.</span></div>
      <div className="campo-busca" role="search">
        <Search className="ic" />
        <input 
          id="busca" 
          type="search" 
          placeholder="Pesquisar nome do estudante..." 
          value={busca} 
          onChange={e => setBusca(e.target.value)}
        />
        {busca && <button className="limpar" onClick={() => setBusca('')}><X className="ic" /></button>}
      </div>
      {estado}
      <div>
        {!busca && base && !base.vazia && (
          <p className="contagem">{base.students.length} estudantes na base oficial. Digite <b>prof</b> e o nome para procurar professores (ex.: prof Gotardo).</p>
        )}
        {termosProf && (
          <div>
            <p className="contagem">Professores encontrados</p>
            <ul className="lista-resultados">
              {professores.filter((p: any) => termosProf.every((t: string) => p.busca.includes(t))).map((p: any, idx: number) => (
                <li key={idx} className="professor">
                  <div className="prof-cab"><span className="avatar"><UserRound className="ic" /></span><div><small>Professor(a)</small><strong>{p.nome}</strong></div></div>
                  {p.lugares.map((l: any, i: number) => (
                    <div key={i} className="prof-local"><MapPin className="ic" /><div><b>{l.local}{l.bloco ? ` · ${l.bloco}` : ''}</b><span>{l.oficinas.join(' / ')}</span></div></div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!termosProf && busca && (
          resultados.length === 0 ? (
            <div className="cartao vazio"><UserRound className="ic" /><strong>Nenhum estudante encontrado</strong></div>
          ) : (
            <div>
              <p className="contagem">{resultados.length} estudantes encontrados</p>
              <ul className="lista-resultados">
                {resultados.slice(0, 50).map((s: any) => (
                  <li key={s.id}>
                    <button className="resultado" onClick={() => setFichaId(s.id)}>
                      <span className="avatar">{s.nome.substring(0, 2).toUpperCase()}</span>
                      <span className="info">
                        <span className="nome">{s.nome}</span>
                        <span className="meta">{s.turma} · {s.segmento}</span>
                        <span className="oficina">{s.oficinas.map((o: string, idx: number) => <span key={idx} className="chip vinho">{o}</span>)}</span>
                      </span>
                      <ChevronRight className="ic" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function renderFicha(id: string, setFichaId: (id: string | null) => void, setAba: (a: any) => void, alunoPorId: Map<any, any>, apsPorAluno: Map<any, any>) {
  const s = alunoPorId.get(id);
  if (!s) return <div className="cartao vazio">Estudante não encontrado.</div>;
  const aps = apsPorAluno.get(id) || [];

  return (
    <div className="pilha">
      <button className="btn sec bloco" onClick={() => setFichaId(null)}><ArrowLeft className="ic" /> VOLTAR À PESQUISA</button>
      <section className="ficha-topo">
        <div className="rotulo">Ficha do estudante</div>
        <h2>{s.nome}</h2>
        <div className="ficha-dados">
          <div><small>Série</small><span>{s.serieTexto || 'Não informada'}</span></div>
          <div><small>Turma</small><span>{s.turma || 'Não informada'}</span></div>
          <div className="largo"><small>Ensino</small><span>{s.segmento || 'Não informado'}</span></div>
        </div>
      </section>
      {aps.map((p: any, idx: number) => (
        <article key={idx} className="cartao apresentacao">
          <div className="rotulo">Oficina</div>
          <h3>{p.oficina}</h3>
          {p.projeto && <p className="projeto">{p.projeto}</p>}
          <div className="local-destaque"><MapPin className="ic" /><div><strong>{p.local}</strong><small>{p.bloco || 'Sala'}</small></div></div>
          <div className="linhas">
            {p.subgrupo && <div><span className="k">Subgrupo</span><span>{p.subgrupo}</span></div>}
            {p.responsaveis && <div><span className="k">Responsáveis</span><span>{p.responsaveis}</span></div>}
          </div>
          {p.sessoes && p.sessoes.map((se: any, i: number) => (
            <div key={i} className="sessao" style={{ marginTop: 8 }}>
              <span className="turno">{se.turno}</span>
              <span>{se.dia} · {se.horario}</span>
            </div>
          ))}
        </article>
      ))}
      <button className="btn sec bloco" onClick={() => setAba('mapa')}><Map className="ic" /> Ver no mapa da Mostra</button>
    </div>
  );
}

function renderOnibus(visitasAtivas: any[], showToast: any) {
  const [tempoRestanteMap, setTempoRestanteMap] = useState<any>({});

  useEffect(() => {
    const calc = () => {
      const now = agora();
      const map: any = {};
      for (const v of visitasAtivas) {
        map[v.id] = Math.max(0, v.saidaPrevistaMs - now);
      }
      setTempoRestanteMap(map);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [visitasAtivas]);

  return (
    <div>
      <h2 className="titulo-tela">Escolas Visitantes</h2>
      <p className="sub-tela">Acompanhe os horários e a organização dos grupos.</p>
      <div className="resumo-onibus">
        <Bus className="ic-g" />
        <div className="num">{visitasAtivas.length}</div>
        <span>{visitasAtivas.length === 1 ? 'escola ativa' : 'escolas ativas'} no evento</span>
      </div>
      {visitasAtivas.length === 0 ? (
        <div className="cartao vazio"><Bus className="ic" /><strong>Nenhuma escola visitante no momento</strong></div>
      ) : (
        visitasAtivas.map((v, i) => {
          const ms = tempoRestanteMap[v.id] || 0;
          return (
            <article key={v.id} className={`onibus c${i % 4}`}>
              <div className="topo">
                <div><div className="rotulo">Escola visitante</div><h3>{v.escola}</h3></div>
                <span className="chip">{v.periodo}</span>
              </div>
              <div className="timer-caixa">
                <div className="rotulo">Tempo restante</div>
                <div className={`timer ${ms <= 0 ? 'fim' : ''}`}>{cronometro(ms)}</div>
                <div className="rodape">Chegada {horaHHMM(v.chegadaMs)} · Saída prevista {horaHHMM(v.saidaPrevistaMs)}</div>
              </div>
              <div className="numeros">
                <div><strong>{v.estudantes ?? '—'}</strong><small>Estudantes</small></div>
                <div><strong>{v.professores ?? '—'}</strong><small>Professores</small></div>
                <div><strong>{(v.estudantes ?? 0) + (v.professores ?? 0)}</strong><small>Total</small></div>
              </div>
              {v.observacoes && <div className="obs-op"><b>Observações:</b> {v.observacoes}</div>}
            </article>
          );
        })
      )}
    </div>
  );
}

function renderMapa(mapa: any, setModalType: (t: string) => void) {
  return (
    <div>
      <h2 className="titulo-tela">Mapa da Mostra</h2>
      <p className="sub-tela">Consulte as salas, blocos e espaços do evento.</p>
      {mapa ? (
        <>
          <div className="mapa-caixa">
            <img src={mapa.src} alt="Mapa oficial" onClick={() => setModalType('visor')} style={{ cursor: 'pointer' }} />
          </div>
          <button className="btn prim bloco" style={{ marginTop: 12 }} onClick={() => setModalType('visor')}>
            <Maximize2 className="ic" /> EXPANDIR MAPA
          </button>
        </>
      ) : (
        <div className="cartao vazio"><Map className="ic" /><strong>Mapa ainda não disponível</strong></div>
      )}
    </div>
  );
}

function renderAdminOnibus(visitasAtivas: any[], setModalType: (t: string) => void, visitas: any[]) {
  return (
    <div>
      <button className="btn prim bloco" onClick={() => setModalType('visita')}><CirclePlus className="ic" /> CADASTRAR ESCOLA / ÔNIBUS</button>
      <div className="resumo-onibus" style={{ marginTop: 12 }}>
        <Bus className="ic-g" />
        <div className="num">{visitasAtivas.length}</div>
        <span>ônibus ativos</span>
      </div>
      {visitasAtivas.map((v, i) => (
        <article key={v.id} className={`onibus c${i % 4}`} style={{ marginTop: 12 }}>
          <h3>{v.escola}</h3>
          <div className="partiu-box">
            <div className="grade-2">
              <button className="btn sec p" onClick={() => setModalType('visita_' + v.id)}><Pencil className="ic" /> EDITAR</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function renderAdminMapa(mapa: any, setMapa: any, showToast: any, auditar: any) {
  const [urlInput, setUrlInput] = useState('');
  return (
    <div>
      <div className="cartao">
        <div className="rotulo">Mapa atual</div>
        <div className="mapa-admin-prev" style={{ marginTop: 8 }}><img src={mapa.src} alt="Mapa" /></div>
      </div>
      <div className="cartao" style={{ marginTop: 12 }}>
        <div className="rotulo">Substituir mapa por link</div>
        <input 
          type="url" 
          className="entrada" 
          placeholder="https://..." 
          value={urlInput} 
          onChange={e => setUrlInput(e.target.value)} 
          style={{ marginBottom: 8 }}
        />
        <button className="btn prim bloco" onClick={() => {
          if (!urlInput.startsWith('https://')) return showToast('Informe um link https:// válido.');
          setMapa({ src: urlInput, nome: 'Mapa customizado', publicadoEmMs: agora() });
          auditar('mapa_publicado', null, null, { nome: 'Mapa customizado' });
          showToast('Mapa atualizado.');
        }}>PUBLICAR MAPA</button>
      </div>
    </div>
  );
}

function renderAdminHistorico(visitas: any[], datas: any, setDatas: any, auditoria: any[], hist: any, setHist: any, datasRascunho: any, setDatasRascunho: any, setModalType: any, showToast: any) {
  const ind = {
    visitas: visitas.filter(v => !v.excluido).length,
    estudantes: visitas.filter(v => !v.excluido).reduce((s, v) => s + (v.estudantes || 0), 0),
    professores: visitas.filter(v => !v.excluido).reduce((s, v) => s + (v.professores || 0), 0),
    grupos: visitas.filter(v => !v.excluido).reduce((s, v) => s + (v.totalGrupos || 0), 0)
  };

  const d = datasRascunho || datas || { dia1: '2026-10-22', dia2: '2026-10-23' };

  return (
    <div>
      <div className="indicadores">
        <div className="indicador dest"><strong>{ind.visitas}</strong><small>Total de visitas</small></div>
        <div className="indicador"><strong>{ind.estudantes}</strong><small>Estudantes</small></div>
      </div>
      <div className="cartao config-dias" style={{ marginTop: 14 }}>
        <h3>DATAS OFICIAIS</h3>
        <div className="dia-config">
          <label>1º Dia</label>
          <input type="date" value={d.dia1 || ''} onChange={e => setDatasRascunho({ ...d, dia1: e.target.value })} />
        </div>
        <div className="dia-config" style={{ marginTop: 8 }}>
          <label>2º Dia</label>
          <input type="date" value={d.dia2 || ''} onChange={e => setDatasRascunho({ ...d, dia2: e.target.value })} />
        </div>
        <button className="btn prim bloco" style={{ marginTop: 10 }} onClick={() => {
          setDatas({ ...d, confirmado: true });
          setDatasRascunho(null);
          showToast('Datas salvas.');
        }}>SALVAR DATAS</button>
      </div>

      <div className="cartao relatorios" style={{ marginTop: 14 }}>
        <button className="btn verde bloco" onClick={async () => {
          await baixarExcel(visitas.filter(v => !v.excluido), datas, ind);
          showToast('Relatório Excel gerado.');
        }}><FileSpreadsheet className="ic" /> BAIXAR EXCEL</button>
        <button className="btn azul bloco" onClick={async () => {
          await baixarWord(visitas.filter(v => !v.excluido), datas, ind);
          showToast('Relatório Word gerado.');
        }}><FileText className="ic" /> BAIXAR WORD</button>
      </div>
    </div>
  );
}

// --- EXCEL & WORD GENERATION ---
async function baixarExcel(visitas: any[], datas: any, ind: any) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resumo');
  ws.addRow(['Escola', 'Data', 'Período', 'Estudantes', 'Professores']);
  visitas.forEach(v => ws.addRow([v.escola, v.data, v.periodo, v.estudantes, v.professores]));
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Mostra_SESI_STEAM_2026_Relatorio.xlsx`;
  a.click();
}

async function baixarWord(visitas: any[], datas: any, ind: any) {
  const { Document, Packer, Paragraph, TextRun } = Docx;
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Relatório Mostra SESI STEAM 2026', bold: true, size: 32 })] }),
        new Paragraph({ children: [new TextRun({ text: `Total de visitas: ${ind.visitas} | Estudantes: ${ind.estudantes}`, size: 24 })] })
      ]
    }]
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Mostra_SESI_STEAM_2026_Relatorio.docx`;
  a.click();
}

// --- MODALS ---
function renderPinModal(setModalType: any, setAdminLogado: any, setAmbiente: any, showToast: any) {
  const [pin, setPin] = useState('');
  return (
    <div className="fundo-modal">
      <div className="modal">
        <div className="modal-cab">
          <h2>ACESSO ADMINISTRATIVO</h2>
          <button className="fechar" onClick={() => setModalType(null)}><X className="ic" /></button>
        </div>
        <div className="modal-corpo">
          <p className="texto-centro">Digite a senha numérica de {PIN_DIGITOS} dígitos (padrão: 1234567).</p>
          <div className="pin">
            {[...Array(PIN_DIGITOS)].map((_, i) => (
              <span key={i} className={i < pin.length ? 'cheio' : ''} />
            ))}
            <input 
              className="pin-input" 
              type="password" 
              maxLength={PIN_DIGITOS} 
              value={pin} 
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, PIN_DIGITOS);
                setPin(val);
                if (val === PIN_CORRETO) {
                  setAdminLogado(true);
                  localStorage.setItem('cg_admin_ate', String(Date.now() + SESSAO_ADMIN_HORAS * 3600e3));
                  setModalType(null);
                  setAmbiente('admin');
                  showToast('Acesso administrativo liberado.');
                }
              }} 
              autoFocus 
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function renderVisitaModal(modalData: any, setModalType: any, setVisitas: any, showToast: any, auditar: any) {
  const [escola, setEscola] = useState('');
  const [minutos, setMinutos] = useState('60');
  const [estudantes, setEstudantes] = useState('');
  const [professores, setProfessores] = useState('');

  return (
    <div className="fundo-modal">
      <div className="modal">
        <div className="modal-cab">
          <h2>Cadastrar Escola / Ônibus</h2>
          <button className="fechar" onClick={() => setModalType(null)}><X className="ic" /></button>
        </div>
        <div className="modal-corpo">
          <div className="campo">
            <label>NOME DA ESCOLA *</label>
            <input type="text" className="entrada" placeholder="Nome da escola..." value={escola} onChange={e => setEscola(e.target.value)} />
          </div>
          <div className="campo" style={{ marginTop: 12 }}>
            <label>TEMPO DE PERMANÊNCIA (MINUTOS) *</label>
            <input type="number" className="entrada" value={minutos} onChange={e => setMinutos(e.target.value)} />
          </div>
          <div className="grade-2" style={{ marginTop: 12 }}>
            <div className="campo">
              <label>Estudantes</label>
              <input type="number" className="entrada" value={estudantes} onChange={e => setEstudantes(e.target.value)} />
            </div>
            <div className="campo">
              <label>Professores</label>
              <input type="number" className="entrada" value={professores} onChange={e => setProfessores(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-rodape">
          <button className="btn prim bloco" onClick={() => {
            if (!escola.trim()) return showToast('Informe o nome da escola.');
            const min = Number(minutos) || 60;
            const t = agora();
            const nova = {
              id: novoId('v'),
              escola: escola.trim(),
              escolaNorm: normalizar(escola),
              data: dataISO(t),
              periodo: periodoDe(t),
              chegadaMs: t,
              minutos: min,
              saidaPrevistaMs: t + min * 60000,
              estudantes: inteiroOuNulo(estudantes),
              professores: inteiroOuNulo(professores),
              grupos: [],
              totalGrupos: 0,
              status: 'ativo',
              partidaMs: null,
              excluido: false
            };
            setVisitas((prev: any[]) => [nova, ...prev]);
            auditar('cadastro', nova, null, nova);
            setModalType(null);
            showToast('Ônibus cadastrado com sucesso!');
          }}>CADASTRAR ÔNIBUS</button>
        </div>
      </div>
    </div>
  );
}

function renderVisorModal(mapa: any, setModalType: any) {
  return (
    <div className="visor" role="dialog" aria-label="Mapa ampliado">
      <img src={mapa.src} alt="Mapa oficial ampliado" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      <button className="visor-fechar" onClick={() => setModalType(null)} aria-label="Fechar mapa"><X className="ic" /></button>
    </div>
  );
}
