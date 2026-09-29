import type { LinhaDeConformidade } from "@/features/sst/conformidade";
import { ROTULO_SITUACAO as SITUACAO_SST } from "@/features/sst/conformidade";

import type { Relatorio, Valor } from "./relatorio";

/**
 * Montagem de cada relatório a partir das linhas que a RLS devolveu. Puro:
 * nada aqui decide permissão nem escopo — só agrupa, conta e formata.
 */

export type Lotacao = { pessoa_id: string; contrato: string; unidade: string };

function br(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function brHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

function porLotacao(lotacoes: Lotacao[]): Map<string, Lotacao[]> {
  const m = new Map<string, Lotacao[]>();
  for (const l of lotacoes) m.set(l.pessoa_id, [...(m.get(l.pessoa_id) ?? []), l]);
  return m;
}

const SEM_LOTACAO = { contrato: "—", unidade: "sem alocação vigente" };

function ordenar(linhas: Valor[][]): Valor[][] {
  return linhas.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = String(a[i] ?? "").localeCompare(String(b[i] ?? ""), "pt-BR");
      if (c !== 0) return c;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------
// 1. Pendências de ciência
// ---------------------------------------------------------------------
export type Pendencia = {
  documento_id: string;
  titulo: string;
  tipo_nome: string;
  publicado_em: string | null;
  prazo_ciencia: string | null;
  pessoa_id: string;
  pessoa_nome: string;
  matricula: string | null;
};

export function montarPendencias(pendencias: Pendencia[], lotacoes: Lotacao[], hoje: string, recorte: string): Relatorio {
  const lot = porLotacao(lotacoes);
  const detalhe: Valor[][] = [];
  const resumo = new Map<string, { contrato: string; unidade: string; pessoas: Set<string>; pendencias: number; vencidas: number }>();

  for (const p of pendencias) {
    const vencida = p.prazo_ciencia !== null && p.prazo_ciencia < hoje;
    for (const l of lot.get(p.pessoa_id) ?? [SEM_LOTACAO]) {
      detalhe.push([
        l.contrato,
        l.unidade,
        p.pessoa_nome,
        p.matricula,
        p.titulo,
        p.tipo_nome,
        br(p.publicado_em),
        br(p.prazo_ciencia),
        vencida ? "vencida" : "no prazo",
        vencida ? diasEntre(p.prazo_ciencia!, hoje) : 0,
      ]);
      const chave = `${l.contrato}|${l.unidade}`;
      const g = resumo.get(chave) ?? { contrato: l.contrato, unidade: l.unidade, pessoas: new Set(), pendencias: 0, vencidas: 0 };
      g.pessoas.add(p.pessoa_id);
      g.pendencias++;
      if (vencida) g.vencidas++;
      resumo.set(chave, g);
    }
  }

  return {
    titulo: "Pendências de ciência",
    recorte,
    resumo: {
      colunas: ["Contrato", "Unidade", "Pessoas com pendência", "Pendências", "Vencidas"],
      linhas: ordenar([...resumo.values()].map((g) => [g.contrato, g.unidade, g.pessoas.size, g.pendencias, g.vencidas])),
    },
    detalhe: {
      colunas: ["Contrato", "Unidade", "Pessoa", "Matrícula", "Documento", "Tipo", "Publicado em", "Prazo", "Situação", "Dias de atraso"],
      linhas: ordenar(detalhe),
    },
    total: { valor: new Set(pendencias.map((p) => `${p.documento_id}:${p.pessoa_id}`)).size, rotulo: "pendências" },
  };
}

// ---------------------------------------------------------------------
// 2. Ciências registradas
// ---------------------------------------------------------------------
export type CienciaRegistrada = {
  id: string;
  protocolo: string;
  tipo: "confirmacao" | "divergencia";
  respondido_em: string;
  documento_versao: number;
  pessoa_nome: string;
  matricula: string | null;
  documento_titulo: string;
  tipo_documento: string;
  competencia: string | null;
};

export function montarCiencias(ciencias: CienciaRegistrada[], recorte: string): Relatorio {
  const unicas = [...new Map(ciencias.map((c) => [c.id, c])).values()].sort((a, b) => a.respondido_em.localeCompare(b.respondido_em));
  const porTipo = new Map<string, { confirmacoes: number; divergencias: number }>();
  for (const c of unicas) {
    const g = porTipo.get(c.tipo_documento) ?? { confirmacoes: 0, divergencias: 0 };
    if (c.tipo === "confirmacao") g.confirmacoes++;
    else g.divergencias++;
    porTipo.set(c.tipo_documento, g);
  }
  return {
    titulo: "Ciências registradas",
    recorte,
    resumo: {
      colunas: ["Tipo de documento", "Confirmações", "Divergências"],
      linhas: ordenar([...porTipo].map(([t, g]) => [t, g.confirmacoes, g.divergencias])),
    },
    detalhe: {
      colunas: ["Protocolo", "Respondido em", "Resposta", "Pessoa", "Matrícula", "Documento", "Tipo", "Versão", "Competência"],
      linhas: unicas.map((c) => [
        c.protocolo,
        brHora(c.respondido_em),
        c.tipo === "confirmacao" ? "confirmação" : "divergência",
        c.pessoa_nome,
        c.matricula,
        c.documento_titulo,
        c.tipo_documento,
        c.documento_versao,
        c.competencia ? c.competencia.slice(0, 7) : null,
      ]),
    },
    total: { valor: unicas.length, rotulo: "ciências" },
  };
}

// ---------------------------------------------------------------------
// 3. Solicitações
// ---------------------------------------------------------------------
export type SolicitacaoDoRelatorio = {
  protocolo: string;
  tipo: string;
  status: string;
  contrato: string | null;
  criado_em: string;
  prazo: string | null;
  concluida_em: string | null;
};

/**
 * Tempo de atendimento em dias corridos, da abertura ao encerramento
 * (`concluida_em`, gravado pelo trigger da 0020 em concluída ou cancelada) —
 * ou até hoje, se ainda não encerrou. "No prazo" compara a data de encerramento (ou hoje)
 * com o prazo de SLA.
 */
export function montarSolicitacoes(
  lista: SolicitacaoDoRelatorio[],
  hoje: string,
  recorte: string,
  rotuloTipo: (t: string) => string,
  rotuloStatus: (s: string) => string,
): Relatorio {
  const grupos = new Map<string, { tipo: string; status: string; n: number; dias: number; foraDoPrazo: number }>();
  const detalhe: Valor[][] = [];
  for (const s of lista) {
    const dias = diasEntre(s.criado_em, s.concluida_em ?? hoje);
    const referencia = (s.concluida_em ?? hoje).slice(0, 10);
    const noPrazo = s.prazo ? referencia <= s.prazo : null;
    detalhe.push([
      s.protocolo,
      rotuloTipo(s.tipo),
      rotuloStatus(s.status),
      s.contrato,
      br(s.criado_em),
      br(s.prazo),
      br(s.concluida_em),
      dias,
      noPrazo === null ? "sem prazo" : noPrazo ? "sim" : "não",
    ]);
    const chave = `${s.tipo}|${s.status}`;
    const g = grupos.get(chave) ?? { tipo: rotuloTipo(s.tipo), status: rotuloStatus(s.status), n: 0, dias: 0, foraDoPrazo: 0 };
    g.n++;
    g.dias += dias;
    if (noPrazo === false) g.foraDoPrazo++;
    grupos.set(chave, g);
  }
  return {
    titulo: "Solicitações",
    recorte,
    resumo: {
      colunas: ["Tipo", "Situação", "Quantidade", "Tempo médio (dias)", "Fora do prazo"],
      linhas: ordenar([...grupos.values()].map((g) => [g.tipo, g.status, g.n, Math.round((g.dias / g.n) * 10) / 10, g.foraDoPrazo])),
    },
    detalhe: {
      colunas: ["Protocolo", "Tipo", "Situação", "Contrato", "Aberta em", "Prazo", "Encerrada em", "Tempo (dias)", "No prazo"],
      linhas: detalhe,
    },
    total: { valor: lista.length, rotulo: "solicitações" },
  };
}

// ---------------------------------------------------------------------
// 4. Quadro alocado e movimentações
// ---------------------------------------------------------------------
export type AlocacaoDoRelatorio = {
  pessoa_nome: string;
  matricula: string | null;
  contrato: string;
  unidade: string;
  funcao: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
};

/** Vigente no fim do período: começou até lá, e não terminou antes. */
function vigenteEm(a: AlocacaoDoRelatorio, dia: string): boolean {
  if (a.data_inicio > dia) return false;
  if (a.data_fim && a.data_fim < dia) return false;
  if (a.status === "encerrada" && !a.data_fim) return false;
  return true;
}

export function montarQuadro(alocacoes: AlocacaoDoRelatorio[], de: string, ate: string, recorte: string): Relatorio {
  const grupos = new Map<string, { contrato: string; unidade: string; alocados: number; entradas: number; saidas: number }>();
  const detalhe: Valor[][] = [];
  for (const a of alocacoes) {
    const entrou = a.data_inicio >= de && a.data_inicio <= ate;
    const saiu = a.data_fim !== null && a.data_fim >= de && a.data_fim <= ate;
    const vigente = vigenteEm(a, ate);
    if (!vigente && !entrou && !saiu) continue;

    const g = grupos.get(`${a.contrato}|${a.unidade}`) ?? { contrato: a.contrato, unidade: a.unidade, alocados: 0, entradas: 0, saidas: 0 };
    if (vigente) g.alocados++;
    if (entrou) g.entradas++;
    if (saiu) g.saidas++;
    grupos.set(`${a.contrato}|${a.unidade}`, g);

    detalhe.push([
      a.contrato,
      a.unidade,
      a.pessoa_nome,
      a.matricula,
      a.funcao,
      br(a.data_inicio),
      br(a.data_fim),
      a.status,
      [entrou ? "entrada" : null, saiu ? "saída" : null].filter(Boolean).join(" e ") || null,
    ]);
  }
  return {
    titulo: "Quadro alocado",
    recorte,
    resumo: {
      colunas: ["Contrato", "Unidade", "Alocados no fim do período", "Entradas", "Saídas"],
      linhas: ordenar([...grupos.values()].map((g) => [g.contrato, g.unidade, g.alocados, g.entradas, g.saidas])),
    },
    detalhe: {
      colunas: ["Contrato", "Unidade", "Pessoa", "Matrícula", "Função", "Início", "Fim", "Situação", "Movimento no período"],
      linhas: ordenar(detalhe),
    },
    total: { valor: detalhe.length, rotulo: "alocações" },
  };
}

// ---------------------------------------------------------------------
// 5. Conformidade de SST
// ---------------------------------------------------------------------
export function montarSst(linhas: LinhaDeConformidade[], recorte: string): Relatorio {
  const grupos = new Map<string, { contrato: string; unidade: string; vencido: number; a_vencer: number; em_dia: number }>();
  const detalhe: Valor[][] = [];
  for (const l of linhas) {
    for (const lot of l.lotacoes) {
      const chave = `${lot.contrato_numero}|${lot.unidade_nome}`;
      const g = grupos.get(chave) ?? { contrato: lot.contrato_numero, unidade: lot.unidade_nome, vencido: 0, a_vencer: 0, em_dia: 0 };
      g[l.situacao]++;
      grupos.set(chave, g);
      detalhe.push([lot.contrato_numero, lot.unidade_nome, l.pessoa_nome, l.tipo_nome, l.titulo, br(l.valido_ate), SITUACAO_SST[l.situacao], l.dias]);
    }
  }
  return {
    titulo: "Conformidade de SST",
    recorte,
    resumo: {
      colunas: ["Contrato", "Unidade", "Vencidos", "A vencer (30 dias)", "Em dia"],
      linhas: ordenar([...grupos.values()].map((g) => [g.contrato, g.unidade, g.vencido, g.a_vencer, g.em_dia])),
    },
    detalhe: {
      colunas: ["Contrato", "Unidade", "Pessoa", "Tipo", "Documento", "Válido até", "Situação", "Dias até o vencimento"],
      linhas: ordenar(detalhe),
    },
    total: { valor: linhas.length, rotulo: "documentos" },
  };
}

// ---------------------------------------------------------------------
// 6. Acessos e downloads
// ---------------------------------------------------------------------
export type EventoDeAcesso = {
  criado_em: string;
  usuario_nome: string | null;
  usuario_email: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  ip: string | null;
};

const ROTULO_ACESSO: Record<string, string> = {
  login: "entrada",
  logout: "saída",
  falha_login: "senha errada",
  login_bloqueado: "bloqueio",
  ver: "leitura de dado sensível",
  download: "download",
};

export function montarAcessos(eventos: EventoDeAcesso[], recorte: string): Relatorio {
  const porUsuario = new Map<string, { nome: string; email: string; entradas: number; falhas: number; leituras: number; downloads: number }>();
  for (const e of eventos) {
    const chave = e.usuario_email ?? e.usuario_nome ?? "(sem usuário)";
    const g = porUsuario.get(chave) ?? {
      nome: e.usuario_nome ?? "(sem usuário)",
      email: e.usuario_email ?? "",
      entradas: 0,
      falhas: 0,
      leituras: 0,
      downloads: 0,
    };
    if (e.acao === "login") g.entradas++;
    if (e.acao === "falha_login" || e.acao === "login_bloqueado") g.falhas++;
    if (e.acao === "ver") g.leituras++;
    if (e.acao === "download") g.downloads++;
    porUsuario.set(chave, g);
  }
  return {
    titulo: "Acessos e downloads",
    recorte,
    resumo: {
      colunas: ["Usuário", "E-mail", "Entradas", "Senha errada / bloqueio", "Leituras sensíveis", "Downloads"],
      linhas: ordenar([...porUsuario.values()].map((g) => [g.nome, g.email, g.entradas, g.falhas, g.leituras, g.downloads])),
    },
    detalhe: {
      colunas: ["Data e hora", "Usuário", "E-mail", "Ação", "O quê", "Id", "IP"],
      linhas: eventos.map((e) => [
        brHora(e.criado_em),
        e.usuario_nome,
        e.usuario_email,
        ROTULO_ACESSO[e.acao] ?? e.acao,
        e.entidade,
        e.entidade_id,
        e.ip,
      ]),
    },
    total: { valor: eventos.length, rotulo: "eventos" },
  };
}
