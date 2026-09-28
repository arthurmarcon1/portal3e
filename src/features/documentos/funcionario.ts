import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Leitura dos documentos pelo lado do funcionário (F3.4).
 *
 * Client do usuário, como sempre. A RLS entrega a ele exatamente o que é
 * dele: os individuais (publicados e arquivados, 0016), os coletivos que o
 * alcançam, e — embutidas — só as próprias ciências (`ciencias_leitura`).
 * Por isso "pendente" aqui é só "pede ciência e a lista embutida veio vazia":
 * não há ciência de outra pessoa que pudesse aparecer ali.
 */

export type RespostaDeCiencia = {
  id: string;
  tipo: "confirmacao" | "divergencia";
  protocolo: string;
  respondido_em: string;
  justificativa: string | null;
};

export type DocumentoDoFuncionario = {
  id: string;
  titulo: string;
  tipo_nome: string;
  exige_ciencia: boolean;
  prazo_ciencia: string | null;
  publicado_em: string | null;
  resposta: RespostaDeCiencia | null;
};

/** Hoje em Brasília (yyyy-mm-dd): prazo é data civil, e o servidor roda em UTC. */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Publicados que chegam a esta pessoa, mais recentes primeiro. */
export async function documentosDoFuncionario(): Promise<DocumentoDoFuncionario[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("documentos")
    .select(
      "id, titulo, prazo_ciencia, publicado_em, documento_tipos(nome, exige_ciencia), ciencias(id, tipo, protocolo, respondido_em, justificativa)",
    )
    .eq("status", "publicado")
    .order("publicado_em", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data ?? []).map((d) => ({
    id: d.id,
    titulo: d.titulo,
    tipo_nome: d.documento_tipos?.nome ?? "Documento",
    exige_ciencia: d.documento_tipos?.exige_ciencia ?? false,
    prazo_ciencia: d.prazo_ciencia,
    publicado_em: d.publicado_em,
    resposta: d.ciencias?.[0] ?? null,
  }));
}

/** Pedem ciência e ainda não têm resposta — prazo mais próximo primeiro. */
export function pendencias(documentos: DocumentoDoFuncionario[]): DocumentoDoFuncionario[] {
  return documentos
    .filter((d) => d.exige_ciencia && !d.resposta)
    .sort((a, b) => (a.prazo_ciencia ?? "9999").localeCompare(b.prazo_ciencia ?? "9999"));
}

export type DocumentoParaCiencia = {
  id: string;
  titulo: string;
  descricao: string | null;
  versao: number;
  status: "publicado" | "arquivado";
  prazo_ciencia: string | null;
  publicado_em: string | null;
  tipo: { chave: string; nome: string; exige_ciencia: boolean; exige_2fa: boolean };
  resposta: RespostaDeCiencia | null;
  /** Versão que substituiu esta, se a pessoa estiver olhando uma arquivada. */
  versao_atual_id: string | null;
  /** Protocolo da solicitação que a divergência abriu, se abriu. */
  solicitacao_protocolo: string | null;
};

/**
 * O documento da tela de ciência, ou `null` se não existe — ou se a RLS não
 * o entrega a esta pessoa, que para a tela é a mesma coisa.
 */
export async function documentoParaCiencia(id: string): Promise<DocumentoParaCiencia | null> {
  const supabase = await criarClienteServidor();

  const { data: d, error } = await supabase
    .from("documentos")
    .select(
      `id, titulo, descricao, versao, status, prazo_ciencia, publicado_em,
       documento_tipos(chave, nome, exige_ciencia, exige_2fa),
       ciencias(id, tipo, protocolo, respondido_em, justificativa)`,
    )
    .eq("id", id)
    .in("status", ["publicado", "arquivado"])
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!d || !d.documento_tipos || d.status === "rascunho") return null;

  let versaoAtual: string | null = null;
  if (d.status === "arquivado") {
    const { data: nova } = await supabase
      .from("documentos")
      .select("id")
      .eq("substitui_id", d.id)
      .eq("status", "publicado")
      .maybeSingle();
    versaoAtual = nova?.id ?? null;
  }

  const resposta = d.ciencias?.[0] ?? null;
  let solicitacaoProtocolo: string | null = null;
  if (resposta?.tipo === "divergencia") {
    // A RLS de `solicitacoes` entrega ao funcionário só as dele.
    const { data: sol } = await supabase
      .from("solicitacoes")
      .select("protocolo")
      .eq("documento_id", d.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    solicitacaoProtocolo = sol?.protocolo ?? null;
  }

  return {
    id: d.id,
    titulo: d.titulo,
    descricao: d.descricao,
    versao: d.versao,
    status: d.status,
    prazo_ciencia: d.prazo_ciencia,
    publicado_em: d.publicado_em,
    tipo: d.documento_tipos,
    resposta,
    versao_atual_id: versaoAtual,
    solicitacao_protocolo: solicitacaoProtocolo,
  };
}

/**
 * A pergunta da tela de ciência (docs/04): direta, com o nome do documento.
 * Espelho pede conferência dos números; o resto, leitura.
 */
export function perguntaDaCiencia(chaveTipo: string): string {
  if (chaveTipo === "espelho_ponto") return "Você confere as informações deste espelho?";
  if (chaveTipo === "norma_interna") return "Você leu e está ciente desta norma?";
  if (chaveTipo === "comunicado") return "Você leu e está ciente deste comunicado?";
  return "Você leu e está ciente deste documento?";
}
