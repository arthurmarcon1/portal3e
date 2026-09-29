#!/usr/bin/env node
/**
 * Espelhos de ponto FICTÍCIOS para demonstração da publicação em lote (F4.1).
 *
 *   node scripts/gerar-espelhos-demo.mjs [--contrato=042] [--competencia=2026-08] [--saida=demo/espelhos]
 *
 * Um PDF por pessoa com alocação vigente no contrato, A4 retrato, no formato
 * de um espelho mensal já fechado: cabeçalho da empresa, dados do
 * funcionário, uma linha por dia (entrada, intervalo, saída, horas) e os
 * totais do mês. O nome do arquivo leva o CPF — é o que a regra de
 * casamento do seed (`regras_espelho`, 0019) procura.
 *
 * O que este script NÃO faz, de propósito:
 *
 * - **Não publica nada nem toca no banco.** Lê as pessoas de
 *   `supabase/seed.sql`, sem credencial. Publicar é pela tela
 *   (/admin/jornada/publicar), que é o que se quer demonstrar.
 * - **Não é apuração de jornada.** O Portal não registra nem apura ponto
 *   (invariante 5); ele recebe o espelho fechado do sistema externo. Este
 *   script faz as vezes desse sistema, com marcações inventadas, só para
 *   haver PDF para publicar.
 * - **Não usa dado real.** Só as pessoas fictícias do seed. Cada página diz
 *   no rodapé que o documento é de demonstração.
 *
 * As marcações variam por pessoa, mas são determinísticas (semente = CPF +
 * competência): rodar de novo gera os mesmos arquivos.
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Document, Page, StyleSheet, Text, View, renderToFile } from "@react-pdf/renderer";
import { createElement as h } from "react";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------

function argumento(nome, padrao) {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
}

const CONTRATO = argumento("contrato", "042");
const COMPETENCIA = argumento("competencia", "2026-08");
const SAIDA = path.resolve(RAIZ, argumento("saida", "demo/espelhos"), COMPETENCIA);

if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(COMPETENCIA)) {
  console.error(`Competência inválida: ${COMPETENCIA}. Use aaaa-mm.`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// Seed: leitura das tuplas de cada INSERT
// ---------------------------------------------------------------------

/** As tuplas de `insert into <tabela> (...) values ...;` como listas de strings (null = null). */
function tuplas(sql, tabela) {
  const inicio = sql.search(new RegExp(`insert into ${tabela} \\(`));
  if (inicio < 0) throw new Error(`seed.sql sem insert em ${tabela}`);
  const fim = sql.indexOf(";\n", inicio);
  const bloco = sql.slice(sql.indexOf("values", inicio) + "values".length, fim);
  return bloco
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("("))
    .map((l) => [...l.matchAll(/'((?:[^']|'')*)'|\bnull\b/g)].map((m) => (m[1] === undefined ? null : m[1].replace(/''/g, "'"))));
}

async function lerSeed() {
  const sql = await readFile(path.join(RAIZ, "supabase/seed.sql"), "utf8");

  const [org] = tuplas(sql, "organizacoes").map(([id, nome, cnpj]) => ({ id, nome, cnpj }));
  const contratantes = new Map(tuplas(sql, "contratantes").map(([id, , nome, cnpj]) => [id, { nome, cnpj }]));
  const unidades = new Map(tuplas(sql, "unidades").map(([id, , , nome, endereco, cidade, uf]) => [id, { nome, endereco, cidade, uf }]));
  const contratos = tuplas(sql, "contratos").map(([id, , contratante_id, numero, descricao]) => ({ id, contratante_id, numero, descricao }));
  const pessoas = new Map(tuplas(sql, "pessoas").map(([id, , nome, cpf, matricula]) => [id, { id, nome, cpf, matricula }]));
  // O primeiro insert de alocações é o das vigentes (8 colunas); o da
  // encerrada vem depois, em insert próprio, e não entra aqui.
  const alocacoes = tuplas(sql, "alocacoes").map(([, , pessoa_id, contrato_id, unidade_id, funcao, data_inicio, status]) => ({
    pessoa_id,
    contrato_id,
    unidade_id,
    funcao,
    data_inicio,
    status,
  }));

  const contrato = contratos.find((c) => c.numero === CONTRATO);
  if (!contrato) throw new Error(`Contrato ${CONTRATO} não está no seed.`);

  return {
    empresa: org,
    contrato,
    contratante: contratantes.get(contrato.contratante_id),
    funcionarios: alocacoes
      .filter((a) => a.contrato_id === contrato.id && a.status !== "encerrada")
      .map((a) => ({ ...pessoas.get(a.pessoa_id), ...a, unidade: unidades.get(a.unidade_id) }))
      .sort((a, b) => a.matricula.localeCompare(b.matricula)),
  };
}

// ---------------------------------------------------------------------
// Marcações fictícias
// ---------------------------------------------------------------------

/** PRNG pequeno e determinístico (mulberry32). */
function aleatorio(semente) {
  let s = 0;
  for (const c of semente) s = (Math.imul(s, 31) + c.charCodeAt(0)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Feriados nacionais por aaaa-mm-dd. Agosto não tem nenhum; ampliar se gerar outro mês. */
const FERIADOS = {
  "2026-09-07": "Feriado — Independência",
  "2026-10-12": "Feriado — N. Sra. Aparecida",
  "2026-11-02": "Feriado — Finados",
  "2026-11-15": "Feriado — Proclamação da República",
  "2026-11-20": "Feriado — Consciência Negra",
  "2026-12-25": "Feriado — Natal",
};

/** Jornada contratual: 44h semanais — seg a sex 07:00–16:00 com 1h de intervalo, sábado 07:00–11:00. */
const JORNADA = "44h semanais · seg. a sex. 07:00–16:00 (intervalo 1h) · sáb. 07:00–11:00";
const PREVISTO = { dia: 8 * 60, sabado: 4 * 60 };
/** Tolerância diária da CLT (art. 58, § 1º): variação de até 10 min no dia não conta. */
const TOLERANCIA = 10;

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const saldo = (min) => (min === 0 ? "" : hhmm(Math.abs(min)));

function marcacoes(f, ano, mes) {
  const r = aleatorio(`${f.cpf}:${COMPETENCIA}`);
  const entre = (a, b) => a + Math.floor(r() * (b - a + 1));
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  // Ausências do mês, pela situação da alocação no seed.
  const ferias = f.status === "ferias" ? 17 : null;
  const afastamento = f.status === "afastado" ? 18 : null;
  const falta = r() < 0.15 ? entre(3, 28) : null;
  const faltaJustificada = r() < 0.3 ? entre(3, 28) : null;

  const linhas = [];
  for (let d = 1; d <= dias; d++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const semana = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
    const base = { dia: `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}`, semana: DIAS_SEMANA[semana] };
    const vazio = { entrada: "", saidaInt: "", retornoInt: "", saida: "", intervalo: "", trabalhadas: "" };

    if (semana === 0) {
      linhas.push({ ...base, ...vazio, tipo: "dsr", obs: "Descanso semanal" });
      continue;
    }
    if (FERIADOS[iso]) {
      linhas.push({ ...base, ...vazio, tipo: "feriado", obs: FERIADOS[iso] });
      continue;
    }
    const previsto = semana === 6 ? PREVISTO.sabado : PREVISTO.dia;
    if (ferias && d >= ferias) {
      linhas.push({ ...base, ...vazio, tipo: "ferias", previsto: 0, obs: "Férias" });
      continue;
    }
    if (afastamento && d >= afastamento) {
      linhas.push({ ...base, ...vazio, tipo: "afastamento", previsto: 0, obs: "Afastamento" });
      continue;
    }
    if (d === falta && semana !== 6) {
      linhas.push({ ...base, ...vazio, tipo: "falta", previsto, obs: "Falta" });
      continue;
    }
    if (d === faltaJustificada && semana !== 6) {
      linhas.push({ ...base, ...vazio, tipo: "justificada", previsto: 0, obs: "Falta justificada" });
      continue;
    }

    const atraso = r() < 0.08 ? entre(12, 35) : 0;
    const entrada = 7 * 60 + entre(-8, 6) + atraso;
    let obs = atraso ? "Atraso" : "";

    if (semana === 6) {
      const saida = 11 * 60 + entre(-3, 8);
      const trabalhadas = saida - entrada;
      linhas.push({ ...base, tipo: "trabalho", previsto, trabalhadas, entrada: hhmm(entrada), saidaInt: "", retornoInt: "", saida: hhmm(saida), intervalo: "", obs });
      continue;
    }

    const saidaInt = 11 * 60 + entre(0, 8);
    const retornoInt = saidaInt + 60 + entre(0, 6);
    const extra = r() < 0.18 ? entre(20, 70) : 0;
    if (extra) obs = obs ? `${obs}; hora extra` : "Hora extra";
    const saida = 16 * 60 + entre(-4, 8) + extra;
    const trabalhadas = saidaInt - entrada + (saida - retornoInt);
    linhas.push({
      ...base,
      tipo: "trabalho",
      previsto,
      trabalhadas,
      entrada: hhmm(entrada),
      saidaInt: hhmm(saidaInt),
      retornoInt: hhmm(retornoInt),
      saida: hhmm(saida),
      intervalo: hhmm(retornoInt - saidaInt),
      obs,
    });
  }

  // Saldo do dia com a tolerância; os totais somam os saldos.
  const totais = { previstas: 0, trabalhadas: 0, extras: 0, atrasos: 0, diasTrabalhados: 0, faltas: 0, justificadas: 0, ausencias: 0, dsr: 0 };
  for (const l of linhas) {
    l.extras = "";
    l.debito = "";
    if (l.tipo === "dsr") totais.dsr++;
    if (l.tipo === "ferias" || l.tipo === "afastamento") totais.ausencias++;
    if (l.tipo === "justificada") totais.justificadas++;
    if (l.tipo === "falta") {
      totais.faltas++;
      totais.previstas += l.previsto;
      l.debito = hhmm(l.previsto);
      totais.atrasos += l.previsto;
    }
    if (l.tipo !== "trabalho") continue;
    totais.diasTrabalhados++;
    totais.previstas += l.previsto;
    totais.trabalhadas += l.trabalhadas;
    const diferenca = l.trabalhadas - l.previsto;
    if (diferenca > TOLERANCIA) {
      totais.extras += diferenca;
      l.extras = saldo(diferenca);
    } else if (diferenca < -TOLERANCIA) {
      totais.atrasos += -diferenca;
      l.debito = saldo(diferenca);
    }
    l.trabalhadas = hhmm(l.trabalhadas);
  }
  return { linhas, totais };
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------

const COR = { texto: "#1A1D21", suave: "#5B6570", borda: "#B8BEC6", faixa: "#EEF0F2", fds: "#F6F7F8" };

const s = StyleSheet.create({
  pagina: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 28, fontFamily: "Helvetica", fontSize: 7.5, color: COR.texto },
  topo: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderColor: COR.texto, paddingBottom: 6 },
  empresa: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  suave: { color: COR.suave },
  quadro: { flexDirection: "row", flexWrap: "wrap", borderWidth: 0.75, borderColor: COR.borda, marginTop: 8 },
  campo: { width: "33.33%", paddingVertical: 3, paddingHorizontal: 5, borderColor: COR.borda },
  rotulo: { fontSize: 6, color: COR.suave, textTransform: "uppercase" },
  valor: { fontSize: 8, marginTop: 1 },
  tabela: { marginTop: 8, borderWidth: 0.75, borderColor: COR.borda },
  linha: { flexDirection: "row", borderTopWidth: 0.5, borderColor: COR.borda, minHeight: 12.5, alignItems: "center" },
  cab: { flexDirection: "row", backgroundColor: COR.faixa, fontFamily: "Helvetica-Bold", fontSize: 6.5, minHeight: 18, alignItems: "center" },
  c: { paddingHorizontal: 3, textAlign: "center" },
  totais: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, borderWidth: 0.75, borderColor: COR.borda },
  total: { width: "25%", paddingVertical: 4, paddingHorizontal: 5 },
  totalValor: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 1 },
  declaracao: { marginTop: 10, fontSize: 7, color: COR.suave, lineHeight: 1.4 },
  rodape: { position: "absolute", bottom: 18, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: COR.suave },
});

const COLUNAS = [
  ["Dia", "dia", 7],
  ["Sem.", "semana", 6],
  ["Entrada", "entrada", 8],
  ["Saída\nintervalo", "saidaInt", 9],
  ["Retorno\nintervalo", "retornoInt", 9],
  ["Saída", "saida", 8],
  ["Intervalo", "intervalo", 8],
  ["Horas\ntrabalhadas", "trabalhadas", 9],
  ["Extras", "extras", 7],
  ["Atrasos /\nfaltas", "debito", 8],
  ["Ocorrência", "obs", 21],
];

const formatarCpf = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
const formatarCnpj = (c) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
const formatarData = (iso) => iso.split("-").reverse().join("/");

function Campo(rotulo, valor, largura = "33.33%") {
  return h(View, { style: [s.campo, { width: largura }] }, h(Text, { style: s.rotulo }, rotulo), h(Text, { style: s.valor }, valor));
}

function espelho({ empresa, contrato, contratante, f, ano, mes, linhas, totais, fechadoEm }) {
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const periodo = `01/${String(mes).padStart(2, "0")}/${ano} a ${ultimoDia}/${String(mes).padStart(2, "0")}/${ano}`;

  return h(
    Document,
    { title: `Espelho de ponto ${String(mes).padStart(2, "0")}/${ano} — ${f.nome}`, author: empresa.nome, subject: "Demonstração — dados fictícios" },
    h(
      Page,
      { size: "A4", orientation: "portrait", style: s.pagina },
      h(
        View,
        { style: s.topo },
        h(
          View,
          null,
          h(Text, { style: s.empresa }, "3e Gestão de Pessoas"),
          h(Text, { style: s.suave }, `CNPJ ${formatarCnpj(empresa.cnpj)}`),
        ),
        h(
          View,
          null,
          h(Text, { style: s.titulo }, "Espelho de ponto"),
          h(Text, { style: [s.suave, { textAlign: "right" }] }, `Competência ${MESES[mes - 1].toLowerCase()} de ${ano} · período ${periodo}`),
        ),
      ),
      h(
        View,
        { style: s.quadro },
        Campo("Funcionário", f.nome, "50%"),
        Campo("CPF", formatarCpf(f.cpf), "25%"),
        Campo("Matrícula", f.matricula, "25%"),
        Campo("Função", f.funcao, "50%"),
        Campo("Admissão no posto", formatarData(f.data_inicio), "25%"),
        Campo("Situação", { ativa: "Ativo", ferias: "Férias", afastado: "Afastado" }[f.status] ?? f.status, "25%"),
        Campo("Tomador", `${contratante.nome} · contrato ${contrato.numero}`, "50%"),
        Campo("Unidade", `${f.unidade.nome} · ${f.unidade.cidade}/${f.unidade.uf}`, "50%"),
        Campo("Jornada contratual", JORNADA, "100%"),
      ),
      h(
        View,
        { style: s.tabela },
        h(
          View,
          { style: s.cab },
          ...COLUNAS.map(([rotulo, , largura]) => h(Text, { key: rotulo, style: [s.c, { width: `${largura}%` }] }, rotulo)),
        ),
        ...linhas.map((l) =>
          h(
            View,
            { key: l.dia, style: [s.linha, l.tipo === "dsr" || l.tipo === "feriado" ? { backgroundColor: COR.fds } : {}] },
            ...COLUNAS.map(([, chave, largura]) =>
              h(
                Text,
                { key: chave, style: [s.c, { width: `${largura}%` }, chave === "obs" ? { textAlign: "left" } : {}, chave === "obs" && l.tipo !== "trabalho" ? { color: COR.suave } : {}] },
                String(l[chave] ?? ""),
              ),
            ),
          ),
        ),
      ),
      h(
        View,
        { style: s.totais },
        ...[
          ["Horas previstas", hhmm(totais.previstas)],
          ["Horas trabalhadas", hhmm(totais.trabalhadas)],
          ["Horas extras (50%)", hhmm(totais.extras)],
          ["Atrasos e faltas", hhmm(totais.atrasos)],
          ["Dias trabalhados", String(totais.diasTrabalhados)],
          ["Faltas", String(totais.faltas)],
          ["Faltas justificadas", String(totais.justificadas)],
          ["Férias / afastamento (dias)", String(totais.ausencias)],
        ].map(([rotulo, valor]) =>
          h(View, { key: rotulo, style: s.total }, h(Text, { style: s.rotulo }, rotulo), h(Text, { style: s.totalValor }, valor)),
        ),
      ),
      h(
        Text,
        { style: s.declaracao },
        `Espelho fechado em ${fechadoEm}. Tolerância diária de ${TOLERANCIA} minutos (CLT, art. 58, § 1º). ` +
          "A conferência deste espelho é registrada pelo funcionário no Portal 3e: confirmação ou divergência, com protocolo.",
      ),
      h(
        View,
        { style: s.rodape, fixed: true },
        h(Text, null, "DEMONSTRAÇÃO — dados fictícios, sem valor legal."),
        h(Text, { render: ({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}` }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------

const { empresa, contrato, contratante, funcionarios } = await lerSeed();
const [ano, mes] = COMPETENCIA.split("-").map(Number);
// Fechamento no 3º dia do mês seguinte, como faria o DP.
const fechadoEm = formatarData(new Date(Date.UTC(ano, mes, 3)).toISOString().slice(0, 10));

await mkdir(SAIDA, { recursive: true });
for (const f of funcionarios) {
  const { linhas, totais } = marcacoes(f, ano, mes);
  const arquivo = path.join(SAIDA, `espelho_${COMPETENCIA}_${f.cpf}.pdf`);
  await renderToFile(espelho({ empresa, contrato, contratante, f, ano, mes, linhas, totais, fechadoEm }), arquivo);
  console.log(`${path.relative(RAIZ, arquivo)}  ${f.matricula}  ${f.nome}`);
}
console.log(`\n${funcionarios.length} espelhos do contrato ${CONTRATO}, competência ${COMPETENCIA}, em ${path.relative(RAIZ, SAIDA)}/`);
