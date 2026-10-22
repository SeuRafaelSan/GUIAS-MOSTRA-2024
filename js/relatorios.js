// Relatórios oficiais (Excel e Word) gerados no próprio aparelho do administrador.
import { dataBR, dataISO, horaHHMM, dataHoraBR, diaSemana, resumoGrupos, agora } from './util.js';

const COR = { vinho: '762E43', amarelo: 'E9BE62', azul: 'DCEEF5', branco: 'FFFFFF', grafite: '24282D', azulEsc: '557D91' };

const PERIODOS = [
  { chave: 'd1m', dia: 'dia1', per: 'Manhã', nome: 'Dia 1 — Manhã' },
  { chave: 'd1t', dia: 'dia1', per: 'Tarde', nome: 'Dia 1 — Tarde' },
  { chave: 'd2m', dia: 'dia2', per: 'Manhã', nome: 'Dia 2 — Manhã' },
  { chave: 'd2t', dia: 'dia2', per: 'Tarde', nome: 'Dia 2 — Tarde' },
];

const statusTxt = (v) => (v.status === 'partiu' ? 'Partiu' : 'Ativo');
const horaNoDia = (ms, dia) => (ms == null ? '' : dataISO(ms) === dia ? horaHHMM(ms) : dataHoraBR(ms));
const totalV = (v) => (v.estudantes == null && v.professores == null ? null : (v.estudantes || 0) + (v.professores || 0));

function linhaVisita(v) {
  return {
    escola: v.escola, data: dataBR(v.data), periodo: v.periodo, chegada: horaHHMM(v.chegadaMs),
    saida: horaNoDia(v.saidaPrevistaMs, v.data), partida: horaNoDia(v.partidaMs, v.data) || '—',
    estudantes: v.estudantes, professores: v.professores, total: totalV(v), grupos: v.totalGrupos || 0,
    distribuicao: [resumoGrupos(v.grupos), v.distribuicaoDetalhe].filter(Boolean).join(' · '),
    observacoes: v.observacoes || '', status: statusTxt(v),
  };
}

function separar(visitas, datas) {
  const ord = [...visitas].sort((a, b) => a.chegadaMs - b.chegadaMs);
  const grupos = Object.fromEntries(PERIODOS.map((p) => [p.chave, ord.filter((v) => v.data === datas?.[p.dia] && v.periodo === p.per)]));
  grupos.outras = ord.filter((v) => v.data !== datas?.dia1 && v.data !== datas?.dia2);
  return { ord, grupos };
}

const somar = (l) => {
  const est = l.reduce((s, v) => s + (v.estudantes || 0), 0), prof = l.reduce((s, v) => s + (v.professores || 0), 0);
  return { visitas: l.length, est, prof, part: est + prof, grupos: l.reduce((s, v) => s + (v.totalGrupos || 0), 0) };
};

function baixar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const carimbo = () => { const t = agora(); return `${dataISO(t)}_${horaHHMM(t).replace(':', 'h')}`; };

function carregarScript(src, global) {
  if (window[global]) return Promise.resolve(window[global]);
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => (window[global] ? res(window[global]) : rej(new Error('Biblioteca não carregou.')));
    s.onerror = () => rej(new Error('Sem acesso à biblioteca de relatórios (verifique a internet).'));
    document.head.appendChild(s);
  });
}

// ════════════════════ EXCEL ════════════════════
const COLUNAS = [
  ['Escola', 'escola', 34], ['Data', 'data', 12], ['Período', 'periodo', 10], ['Chegada', 'chegada', 10],
  ['Saída prevista', 'saida', 15], ['Partida efetiva', 'partida', 15], ['Estudantes', 'estudantes', 12],
  ['Professores', 'professores', 12], ['Total', 'total', 9], ['Grupos', 'grupos', 9], ['Distribuição', 'distribuicao', 34],
  ['Observações operacionais autorizadas', 'observacoes', 40], ['Status', 'status', 10],
];

export async function baixarExcel(visitas, datas, ind) {
  const ExcelJS = await carregarScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', 'ExcelJS');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Central dos Guias — Mostra SESI STEAM 2026'; wb.created = new Date(agora());
  const { ord, grupos } = separar(visitas, datas);
  const borda = { style: 'thin', color: { argb: 'FFE5E8EA' } };
  const bordas = { top: borda, left: borda, bottom: borda, right: borda };
  const preencher = (c, cor) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + cor } }; };
  const cabecalho = (row) => row.eachCell((c) => {
    preencher(c, COR.vinho); c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = { ...bordas, bottom: { style: 'medium', color: { argb: 'FF' + COR.amarelo } } };
  });

  // Resumo Geral
  const r = wb.addWorksheet('Resumo Geral', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  r.columns = [{ width: 44 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 12 }];
  r.mergeCells('A1:F1'); r.getCell('A1').value = 'MOSTRA SESI STEAM 2026 — RELATÓRIO DE ESCOLAS VISITANTES';
  preencher(r.getCell('A1'), COR.vinho); r.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  r.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }; r.getRow(1).height = 30;
  r.mergeCells('A2:F2'); r.getCell('A2').value = `Gerado em ${dataHoraBR(agora())} (America/Bahia) · Dia 1: ${dataBR(datas?.dia1)} · Dia 2: ${dataBR(datas?.dia2)}`;
  r.getCell('A2').font = { italic: true, color: { argb: 'FF626970' } }; r.getCell('A2').alignment = { horizontal: 'center' };
  r.addRow([]);
  const h = r.getRow(4); h.values = ['Indicador', 'Valor']; cabecalho(h); h.height = 22;
  const linhasInd = [
    ['Total de visitas (ônibus)', ind.visitas], ['Escolas distintas', ind.escolas], ['Estudantes visitantes', ind.estudantes],
    ['Professores acompanhantes', ind.professores], ['Participações registradas nas visitas', ind.participacoes], ['Total de grupos formados', ind.grupos],
  ];
  linhasInd.forEach(([k, v], i) => {
    const row = r.addRow([k, v]);
    row.eachCell((c) => { c.border = bordas; preencher(c, i % 2 ? COR.branco : COR.azul); });
    row.getCell(2).font = { bold: true, color: { argb: 'FF' + COR.vinho } }; row.getCell(2).alignment = { horizontal: 'center' };
  });
  r.addRow([]);
  const hp = r.addRow(['Período', 'Visitas', 'Estudantes', 'Professores', 'Participações', 'Grupos']); cabecalho(hp);
  const blocos = [...PERIODOS.map((p) => [`${p.nome} (${dataBR(datas?.[p.dia])})`, grupos[p.chave]]), ...(grupos.outras.length ? [['Outras datas', grupos.outras]] : [])];
  blocos.forEach(([nome, l], i) => {
    const s = somar(l); const row = r.addRow([nome, s.visitas, s.est, s.prof, s.part, s.grupos]);
    row.eachCell((c, n) => { c.border = bordas; preencher(c, i % 2 ? COR.branco : COR.azul); if (n > 1) c.alignment = { horizontal: 'center' }; });
  });
  const tot = somar(ord);
  const rt = r.addRow(['TOTAL GERAL', tot.visitas, tot.est, tot.prof, tot.part, tot.grupos]);
  rt.eachCell((c, n) => { c.border = bordas; preencher(c, COR.amarelo); c.font = { bold: true, color: { argb: 'FF' + COR.grafite } }; if (n > 1) c.alignment = { horizontal: 'center' }; });
  r.addRow([]);
  const nota = r.addRow(['Participações somam estudantes e professores de cada visita; não representam pessoas únicas. Registros excluídos não entram nos totais.']);
  r.mergeCells(`A${nota.number}:F${nota.number}`); nota.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF626970' } }; nota.getCell(1).alignment = { wrapText: true }; nota.height = 28;

  // Abas de visitas
  const abaVisitas = (nome, lista) => {
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = COLUNAS.map(([t, k, w]) => ({ header: t, key: k, width: w }));
    cabecalho(ws.getRow(1)); ws.getRow(1).height = 30;
    lista.map(linhaVisita).forEach((lv, i) => {
      const row = ws.addRow(lv);
      row.eachCell({ includeEmpty: true }, (c, n) => {
        c.border = bordas; preencher(c, i % 2 ? COR.branco : COR.azul);
        c.alignment = { vertical: 'top', wrapText: true, horizontal: n >= 2 && n <= 10 ? 'center' : 'left' };
      });
      if (lv.status === 'Ativo') row.getCell('status').font = { bold: true, color: { argb: 'FF8A5A0B' } };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, lista.length + 1), column: COLUNAS.length } };
    const s = somar(lista);
    const rt2 = ws.addRow({ escola: `TOTAL — ${s.visitas} ${s.visitas === 1 ? 'visita' : 'visitas'}`, estudantes: s.est, professores: s.prof, total: s.part, grupos: s.grupos });
    rt2.eachCell({ includeEmpty: true }, (c, n) => { c.border = bordas; preencher(c, COR.amarelo); c.font = { bold: true }; c.alignment = { horizontal: n === 1 ? 'left' : 'center' }; });
    if (!lista.length) { const v = ws.addRow({ escola: 'Nenhuma visita registrada neste período.' }); v.getCell(1).font = { italic: true, color: { argb: 'FF626970' } }; }
  };
  abaVisitas('Todas as Visitas', ord);
  PERIODOS.forEach((p) => abaVisitas(p.nome, grupos[p.chave]));

  const buf = await wb.xlsx.writeBuffer();
  baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Mostra_SESI_STEAM_2026_Visitas_${carimbo()}.xlsx`);
}

// ════════════════════ WORD ════════════════════
export async function baixarWord(visitas, datas, ind) {
  const D = await import(/* @vite-ignore */ 'https://esm.sh/docx@8.5.0');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, PageOrientation, BorderStyle, HeadingLevel, Footer, PageNumber } = D;
  const { ord, grupos } = separar(visitas, datas);
  const fonte = 'Calibri';
  const t = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: fonte, color: COR.grafite, size: 20, ...o });
  const p = (filhos, o = {}) => new Paragraph({ children: Array.isArray(filhos) ? filhos : [filhos], spacing: { after: 80 }, ...o });
  const borda = { style: BorderStyle.SINGLE, size: 4, color: 'E5E8EA' };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };
  const cel = (txt, o = {}) => new TableCell({
    borders: bordas, margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: o.fundo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fundo } : undefined,
    width: o.largura ? { size: o.largura, type: WidthType.PERCENTAGE } : undefined,
    children: [p(t(txt, { bold: !!o.negrito, color: o.cor || COR.grafite, size: o.tam || 18 }), { alignment: o.centro ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 0 } })],
  });
  const tabela = (cab, linhas, larguras, total) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: cab.map((c, i) => cel(c, { fundo: COR.vinho, cor: COR.branco, negrito: true, centro: i > 0, largura: larguras?.[i] })) }),
      ...linhas.map((l, j) => new TableRow({ cantSplit: true, children: l.map((c, i) => cel(c, { fundo: j % 2 ? COR.branco : COR.azul, centro: i > 0 && typeof c !== 'string' || /^\d/.test(String(c)) && i > 0, largura: larguras?.[i] })) })),
      ...(total ? [new TableRow({ children: total.map((c, i) => cel(c, { fundo: COR.amarelo, negrito: true, centro: i > 0, largura: larguras?.[i] })) })] : []),
    ],
  });
  const titulo = (txt, quebra = false) => new Paragraph({
    heading: HeadingLevel.HEADING_2, pageBreakBefore: quebra, spacing: { before: 240, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COR.amarelo, space: 4 } },
    children: [new TextRun({ text: txt, font: fonte, bold: true, size: 28, color: COR.vinho })],
  });
  const rodape = new Footer({ children: [p([t('Central dos Guias — Mostra SESI STEAM 2026 · Página ', { size: 16, color: '626970' }), new TextRun({ children: [PageNumber.CURRENT], font: fonte, size: 16, color: '626970' })], { alignment: AlignmentType.CENTER })] });
  const n = (x) => (x == null ? '—' : String(x));

  // Relação de escolas distintas
  const porEscola = new Map();
  for (const v of ord) {
    const k = v.escolaNorm || v.escola.toLowerCase();
    const e = porEscola.get(k) || { nome: v.escola, visitas: 0, est: 0, prof: 0, grupos: 0, datas: new Set() };
    e.visitas++; e.est += v.estudantes || 0; e.prof += v.professores || 0; e.grupos += v.totalGrupos || 0; e.datas.add(`${dataBR(v.data).slice(0, 5)} ${v.periodo}`);
    porEscola.set(k, e);
  }
  const escolas = [...porEscola.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const resumo = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 60 }, children: [new TextRun({ text: 'MOSTRA SESI STEAM 2026', font: fonte, bold: true, size: 44, color: COR.vinho })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'RELATÓRIO DE ESCOLAS VISITANTES', font: fonte, bold: true, size: 28, color: COR.grafite })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: COR.amarelo, space: 8 } },
      children: [t(`Dia 1: ${dataBR(datas?.dia1)} · Dia 2: ${dataBR(datas?.dia2)} · Gerado em ${dataHoraBR(agora())}`, { color: '626970', size: 18 })] }),
    titulo('Resumo geral'),
    tabela(['Indicador', 'Total'], [
      ['Total de visitas (ônibus)', String(ind.visitas)], ['Escolas distintas', String(ind.escolas)], ['Total de estudantes', String(ind.estudantes)],
      ['Total de professores', String(ind.professores)], ['Total de participações', String(ind.participacoes)], ['Total de grupos', String(ind.grupos)],
    ], [70, 30]),
    p(t('Participações somam estudantes e professores de cada visita e não representam pessoas únicas. Registros excluídos não entram nos totais.', { size: 16, italics: true, color: '626970' }), { spacing: { before: 80, after: 200 } }),
    titulo('Totais por dia e período'),
    tabela(['Período', 'Visitas', 'Estudantes', 'Professores', 'Participações', 'Grupos'],
      [...PERIODOS.map((pp) => [pp.nome, grupos[pp.chave]]), ...(grupos.outras.length ? [['Outras datas', grupos.outras]] : [])]
        .map(([nome, l]) => { const s = somar(l); return [nome, String(s.visitas), String(s.est), String(s.prof), String(s.part), String(s.grupos)]; }),
      [30, 14, 14, 14, 14, 14],
      (() => { const s = somar(ord); return ['TOTAL GERAL', String(s.visitas), String(s.est), String(s.prof), String(s.part), String(s.grupos)]; })()),
    titulo('Relação de escolas', true),
    escolas.length
      ? tabela(['Escola', 'Visitas', 'Estudantes', 'Professores', 'Grupos', 'Dias / períodos'],
        escolas.map((e) => [e.nome, String(e.visitas), String(e.est), String(e.prof), String(e.grupos), [...e.datas].join(', ')]), [34, 10, 12, 12, 10, 22])
      : p(t('Nenhuma escola registrada.', { italics: true })),
  ];

  const detalhes = [];
  [...PERIODOS.map((pp) => [`${pp.nome} — ${datas?.[pp.dia] ? `${diaSemana(datas[pp.dia])}, ${dataBR(datas[pp.dia])}` : 'data não definida'}`, grupos[pp.chave]]),
    ...(grupos.outras.length ? [['Outras datas', grupos.outras]] : [])].forEach(([nome, lista], i) => {
    detalhes.push(titulo(nome, i > 0));
    if (!lista.length) { detalhes.push(p(t('Nenhuma visita registrada neste período.', { italics: true, color: '626970' }))); return; }
    const s = somar(lista);
    detalhes.push(tabela(['Escola', 'Data', 'Chegada', 'Saída prevista', 'Partida', 'Estud.', 'Prof.', 'Total', 'Grupos', 'Observações', 'Status'],
      lista.map((v) => { const l = linhaVisita(v); return [l.escola, l.data, l.chegada, l.saida, l.partida, n(l.estudantes), n(l.professores), n(l.total), String(l.grupos), [l.distribuicao, l.observacoes].filter(Boolean).join(' · ') || '—', l.status]; }),
      [17, 8, 7, 9, 8, 6, 6, 6, 6, 20, 7],
      [`TOTAL — ${s.visitas} visita(s)`, '', '', '', '', String(s.est), String(s.prof), String(s.part), String(s.grupos), '', '']));
  });

  const doc = new Document({
    creator: 'Central dos Guias', title: 'Relatório de Escolas Visitantes — Mostra SESI STEAM 2026',
    styles: { default: { document: { run: { font: fonte, size: 20, color: COR.grafite } } } },
    sections: [
      { properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, footers: { default: rodape }, children: resumo },
      { properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, footers: { default: rodape }, children: detalhes },
    ],
  });
  baixar(await Packer.toBlob(doc), `Mostra_SESI_STEAM_2026_Relatorio_${carimbo()}.docx`);
}
