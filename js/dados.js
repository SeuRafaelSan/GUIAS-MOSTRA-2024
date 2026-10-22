// Camada de dados. Dois modos com a mesma interface:
//  • "firebase": Firestore + Authentication (produção).
//  • "local": PRÉVIA sem Firebase — dados só no navegador deste aparelho,
//    sincronizados entre abas pelo BroadcastChannel. Nunca é apresentada como oficial.
import { FIREBASE_CONFIG, ADMIN_EMAIL, ARQUIVO_BASE, PIN_PREVIA_SHA256, SESSAO_ADMIN_HORAS, DATAS_REFERENCIA } from './config.js';
import { agora, novoId } from './util.js';

const CHAVE_SESSAO = 'cg_admin_ate';
const CHAVE_CACHE_BASE = 'cg_base_cache';

const lerJSON = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const gravarJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export async function carregarArquivoBase() {
  const r = await fetch(ARQUIVO_BASE, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Arquivo da base não encontrado (${r.status}).`);
  return r.json();
}

function sessaoValida() { return (lerJSON(CHAVE_SESSAO, 0) || 0) > Date.now(); }
function abrirSessao() { gravarJSON(CHAVE_SESSAO, Date.now() + SESSAO_ADMIN_HORAS * 3600e3); }
function fecharSessao() { try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* sem armazenamento */ } }

// ═════════════════════════ PRÉVIA LOCAL ═════════════════════════
class StoreLocal {
  modo = 'local';
  status = { ok: true, texto: 'Prévia local — sem Firebase' };
  constructor() {
    this.canal = 'BroadcastChannel' in window ? new BroadcastChannel('central-guias') : null;
    this.ouvintes = {};
    this.canal?.addEventListener('message', (e) => this.#avisar(e.data));
    window.addEventListener('storage', (e) => e.key?.startsWith('cg_') && this.#avisar(e.key));
  }
  async iniciar() { this.admin = sessaoValida(); }
  #ler(k, def) { return lerJSON(k, def); }
  #gravar(k, v) {
    if (!gravarJSON(k, v)) throw new Error('Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).');
    this.#avisar(k); this.canal?.postMessage(k);
  }
  #avisar(k) { (this.ouvintes[k] || []).forEach((cb) => cb(this.#ler(k, k === 'cg_visitas' || k === 'cg_auditoria' ? [] : null))); }
  #ouvir(k, def, cb) { (this.ouvintes[k] ||= []).push(cb); cb(this.#ler(k, def)); return () => { this.ouvintes[k] = this.ouvintes[k].filter((x) => x !== cb); }; }

  ouvirBase(cb) {
    carregarArquivoBase().then((j) => cb({ versao: j.versao, students: j.students, presentations: j.student_presentations }))
      .catch((e) => cb({ erro: e.message }));
    return () => {};
  }
  ouvirVisitas(cb) { return this.#ouvir('cg_visitas', [], cb); }
  ouvirMapa(cb) { return this.#ouvir('cg_mapa', null, cb); }
  ouvirDatas(cb) { return this.#ouvir('cg_datas', null, (d) => cb(d || { ...DATAS_REFERENCIA, confirmado: false })); }
  ouvirAuditoria(cb) { return this.#ouvir('cg_auditoria', [], (l) => cb((l || []).slice(-80).reverse())); }
  ouvirAlertas() { return () => {}; }

  async entrarAdmin(pin) {
    await new Promise((r) => setTimeout(r, 450));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hash !== PIN_PREVIA_SHA256) throw new Error('Senha incorreta.');
    abrirSessao(); this.admin = true;
  }
  async sairAdmin() { fecharSessao(); this.admin = false; }
  adminAtivo() { return this.admin && sessaoValida(); }

  #auditar(acao, visita, antes, depois) {
    const l = this.#ler('cg_auditoria', []);
    l.push({ id: novoId('a'), acao, visitaId: visita?.id || null, escola: visita?.escola || '', antes: antes || null, depois: depois || null, por: 'prévia local', emMs: agora() });
    this.#gravar('cg_auditoria', l.slice(-300));
  }
  async criarVisita(v) {
    const l = this.#ler('cg_visitas', []);
    const nova = { ...v, id: novoId('v'), criadoEmMs: agora(), atualizadoEmMs: agora() };
    l.push(nova); this.#gravar('cg_visitas', l);
    this.#auditar('cadastro', nova, null, nova);
    return nova.id;
  }
  async atualizarVisita(id, patch, acao = 'edicao') {
    const l = this.#ler('cg_visitas', []);
    const i = l.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('Visita não encontrada.');
    const antes = l[i];
    l[i] = { ...antes, ...patch, atualizadoEmMs: agora() };
    this.#gravar('cg_visitas', l);
    this.#auditar(acao, l[i], antes, l[i]);
  }
  confirmarPartida(id) { return this.atualizarVisita(id, { status: 'partiu', partidaMs: agora() }, 'confirmacao_partida'); }
  excluirVisita(id) { return this.atualizarVisita(id, { excluido: true, excluidoEmMs: agora() }, 'exclusao'); }
  restaurarVisita(id) { return this.atualizarVisita(id, { excluido: false, excluidoEmMs: null }, 'restauracao'); }
  async registrarAlerta() { /* na prévia o alerta é calculado no próprio aparelho */ }

  async publicarMapa(m) {
    this.#gravar('cg_mapa', { ...m, ativo: true, publicadoEmMs: agora() });
    this.#auditar('mapa_publicado', null, null, { nome: m.nome, origem: m.origem });
  }
  async removerMapa() { this.#gravar('cg_mapa', null); this.#auditar('mapa_removido'); }
  async salvarDatas(dia1, dia2) {
    this.#gravar('cg_datas', { dia1, dia2, confirmado: true, confirmadoEmMs: agora() });
    this.#auditar('datas_oficiais', null, null, { dia1, dia2 });
  }
  async estadoBaseRemota() { return null; }
}

// ═════════════════════════ FIREBASE ═════════════════════════
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

class StoreFirebase {
  modo = 'firebase';
  status = { ok: false, texto: 'Conectando ao Firebase…' };
  aoMudarStatus = () => {};

  async iniciar() {
    const [{ initializeApp }, fs, au] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-firestore.js`), import(`${SDK}/firebase-auth.js`),
    ]);
    this.fs = fs; this.au = au;
    const app = initializeApp(FIREBASE_CONFIG);
    try {
      this.db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch { this.db = fs.getFirestore(app); }
    this.auth = au.getAuth(app);
    await au.setPersistence(this.auth, au.browserLocalPersistence);
    let usuario = await new Promise((res) => { const un = au.onAuthStateChanged(this.auth, (u) => { un(); res(u); }); });
    if (usuario && !usuario.isAnonymous && !sessaoValida()) { await au.signOut(this.auth); usuario = null; }
    if (!usuario) usuario = (await au.signInAnonymously(this.auth)).user;
    this.usuario = usuario;
    this.admin = !usuario.isAnonymous && await this.#ehAdmin(usuario.uid);
  }
  #marcar(ok, texto) { this.status = { ok, texto }; this.aoMudarStatus(this.status); }
  async #ehAdmin(uid) {
    const { getDoc, doc } = this.fs;
    try { return (await getDoc(doc(this.db, 'admin_users', uid))).exists(); } catch { return false; }
  }
  #col(n) { return this.fs.collection(this.db, n); }
  #doc(n, id) { return this.fs.doc(this.db, n, id); }

  ouvirBase(cb) {
    const { onSnapshot, getDocs } = this.fs;
    return onSnapshot(this.#doc('system_settings', 'base_estudantes'), async (snap) => {
      try {
        if (!snap.exists()) return cb({ versao: null, students: [], presentations: [], vazia: true });
        const versao = snap.data().versao;
        const cache = lerJSON(CHAVE_CACHE_BASE, null);
        if (cache?.versao === versao) return cb(cache);
        const [s, p] = await Promise.all([getDocs(this.#col('students')), getDocs(this.#col('student_presentations'))]);
        const dados = { versao, students: s.docs.map((d) => d.data()), presentations: p.docs.map((d) => d.data()) };
        gravarJSON(CHAVE_CACHE_BASE, dados);
        cb(dados);
      } catch (e) { cb({ erro: e.message }); }
    }, (e) => cb({ erro: e.message }));
  }
  ouvirVisitas(cb) {
    const { onSnapshot } = this.fs;
    return onSnapshot(this.#col('school_visits'), { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache) this.#marcar(true, 'Conectado ao Firebase');
      else if (!this.status.ok) this.#marcar(false, 'Sem resposta do servidor — exibindo dados em cache');
      cb(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    }, (e) => { this.#marcar(false, 'Erro do Firebase: ' + e.code); cb([]); });
  }
  ouvirMapa(cb) {
    return this.fs.onSnapshot(this.#doc('event_maps', 'oficial'), (s) => cb(s.exists() && s.data().ativo ? s.data() : null), () => cb(null));
  }
  ouvirDatas(cb) {
    return this.fs.onSnapshot(this.#doc('system_settings', 'datas'),
      (s) => cb(s.exists() ? { ...s.data(), confirmado: true } : { ...DATAS_REFERENCIA, confirmado: false }),
      () => cb({ ...DATAS_REFERENCIA, confirmado: false }));
  }
  ouvirAuditoria(cb) {
    const { onSnapshot, query, orderBy, limit } = this.fs;
    return onSnapshot(query(this.#col('audit_logs'), orderBy('emMs', 'desc'), limit(80)), (s) => cb(s.docs.map((d) => d.data())), () => cb([]));
  }
  ouvirAlertas() { return () => {}; }

  async entrarAdmin(pin) {
    const { signInWithEmailAndPassword, signOut, signInAnonymously } = this.au;
    let cred;
    try { cred = await signInWithEmailAndPassword(this.auth, ADMIN_EMAIL, pin); } catch (e) {
      if (['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials', 'auth/user-not-found'].includes(e.code)) throw new Error('Senha incorreta.');
      if (e.code === 'auth/too-many-requests') throw new Error('Muitas tentativas. Aguarde alguns minutos.');
      if (e.code === 'auth/network-request-failed') throw new Error('Sem conexão com o servidor.');
      throw new Error('Falha na autenticação (' + e.code + ').');
    }
    if (!(await this.#ehAdmin(cred.user.uid))) {
      await signOut(this.auth); this.usuario = (await signInAnonymously(this.auth)).user;
      throw new Error('Conta sem permissão administrativa (falta o documento em admin_users).');
    }
    abrirSessao(); this.usuario = cred.user; this.admin = true;
  }
  async sairAdmin() {
    fecharSessao(); this.admin = false;
    await this.au.signOut(this.auth);
    this.usuario = (await this.au.signInAnonymously(this.auth)).user;
  }
  adminAtivo() { return this.admin && sessaoValida(); }

  async #auditar(acao, visita, antes, depois) {
    const { addDoc } = this.fs;
    const limpar = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
    await addDoc(this.#col('audit_logs'), {
      acao, visitaId: visita?.id || null, escola: visita?.escola || '', antes: limpar(antes), depois: limpar(depois),
      por: this.usuario?.email || this.usuario?.uid || '', uid: this.usuario?.uid || '', emMs: agora(),
    });
  }
  async #gravarGrupos(id, v) {
    await this.fs.setDoc(this.#doc('visit_groups', id), { visitId: id, escola: v.escola, linhas: v.grupos || [], totalGrupos: v.totalGrupos || 0, detalhes: v.distribuicaoDetalhe || '', atualizadoEmMs: agora() });
  }
  async criarVisita(v) {
    const { doc, setDoc, serverTimestamp } = this.fs;
    const ref = doc(this.#col('school_visits'));
    const nova = { ...v, id: ref.id, criadoEmMs: agora(), atualizadoEmMs: agora(), criadoEm: serverTimestamp(), criadoPor: this.usuario.uid };
    await setDoc(ref, nova);
    await this.#gravarGrupos(ref.id, v);
    await this.#auditar('cadastro', { ...v, id: ref.id }, null, v);
    return ref.id;
  }
  async atualizarVisita(id, patch, acao = 'edicao') {
    const { getDoc, updateDoc, serverTimestamp } = this.fs;
    const ref = this.#doc('school_visits', id);
    const antes = (await getDoc(ref)).data();
    await updateDoc(ref, { ...patch, atualizadoEmMs: agora(), atualizadoEm: serverTimestamp() });
    const depois = { ...antes, ...patch };
    if ('grupos' in patch) await this.#gravarGrupos(id, depois);
    if (patch.status === 'partiu' || patch.excluido === true) {
      await this.fs.setDoc(this.#doc('notifications', id), { visitId: id, escola: depois.escola, status: 'encerrado', encerradoEmMs: agora() }, { merge: true });
    }
    await this.#auditar(acao, { ...depois, id }, antes, depois);
  }
  confirmarPartida(id) { return this.atualizarVisita(id, { status: 'partiu', partidaMs: agora() }, 'confirmacao_partida'); }
  excluirVisita(id) { return this.atualizarVisita(id, { excluido: true, excluidoEmMs: agora() }, 'exclusao'); }
  restaurarVisita(id) { return this.atualizarVisita(id, { excluido: false, excluidoEmMs: null }, 'restauracao'); }
  async registrarAlerta(v) {
    // Chamado pelo aparelho do administrador quando a saída prevista é atingida.
    await this.fs.setDoc(this.#doc('notifications', v.id), { visitId: v.id, escola: v.escola, tipo: 'saida_prevista', status: 'aberto', saidaPrevistaMs: v.saidaPrevistaMs, emMs: agora() }, { merge: true });
  }

  async publicarMapa(m) {
    await this.fs.setDoc(this.#doc('event_maps', 'oficial'), { ...m, ativo: true, publicadoEmMs: agora(), publicadoPor: this.usuario.uid });
    await this.#auditar('mapa_publicado', null, null, { nome: m.nome, origem: m.origem });
  }
  async removerMapa() {
    await this.fs.setDoc(this.#doc('event_maps', 'oficial'), { ativo: false, removidoEmMs: agora() });
    await this.#auditar('mapa_removido');
  }
  async salvarDatas(dia1, dia2) {
    await this.fs.setDoc(this.#doc('system_settings', 'datas'), { dia1, dia2, confirmadoEmMs: agora(), por: this.usuario.uid });
    await this.#auditar('datas_oficiais', null, null, { dia1, dia2 });
  }

  async estadoBaseRemota() {
    const s = await this.fs.getDoc(this.#doc('system_settings', 'base_estudantes'));
    return s.exists() ? s.data() : null;
  }
  async publicarBase(json, progresso = () => {}) {
    const { writeBatch, getDocs } = this.fs;
    const operacoes = [
      ...json.students.map((s) => ['students', s.id, s]),
      ...json.student_presentations.map((p) => ['student_presentations', p.id, p]),
    ];
    const novos = new Set(operacoes.map(([c, id]) => `${c}/${id}`));
    for (const c of ['students', 'student_presentations']) {
      for (const d of (await getDocs(this.#col(c))).docs) if (!novos.has(`${c}/${d.id}`)) operacoes.push([c, d.id, null]);
    }
    for (let i = 0; i < operacoes.length; i += 400) {
      const lote = writeBatch(this.db);
      for (const [c, id, dado] of operacoes.slice(i, i + 400)) dado ? lote.set(this.#doc(c, id), dado) : lote.delete(this.#doc(c, id));
      await lote.commit();
      progresso(Math.min(operacoes.length, i + 400), operacoes.length);
    }
    await this.fs.setDoc(this.#doc('system_settings', 'base_estudantes'), {
      versao: json.versao, estudantes: json.students.length, apresentacoes: json.student_presentations.length,
      fontes: json.fontes || [], publicadoEmMs: agora(), publicadoPor: this.usuario.uid,
    });
    await this.#auditar('base_estudantes_publicada', null, null, { versao: json.versao, estudantes: json.students.length });
  }
}

export function criarStore() { return FIREBASE_CONFIG ? new StoreFirebase() : new StoreLocal(); }
