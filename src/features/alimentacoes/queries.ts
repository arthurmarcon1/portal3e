import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

import type { Extracao } from "./extracao";

/**
 * Leituras do Conecta. Client do usuário, sempre: quem decide o que aparece
 * é a RLS de `alimentacoes`, `lancamentos` e `rubricas` (0029).
 */

type StatusAlimentacao = Database["public"]["Enums"]["status_alimentacao"];

export type AlimentacaoLinha = {
  id: string;
  tipo: "audio" | "foto";
  status: StatusAlimentacao;
  criado_em: string;
  contrato_numero: string;
  transcricao: string | null;
  extracao: Extracao | null;
};

export async function listarAlimentacoes(): Promise<AlimentacaoLinha[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("alimentacoes")
    .select("id, tipo, status, criado_em, transcricao, extracao, contratos(numero)")
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    id: a.id,
    tipo: a.tipo,
    status: a.status,
    criado_em: a.criado_em,
    contrato_numero: a.contratos?.numero ?? "—",
    transcricao: a.transcricao,
    extracao: a.extracao as Extracao | null,
  }));
}

export type Lancamento = {
  id: string;
  descricao: string;
  valor: number;
  competencia: string;
  rubrica_nome: string;
  unidade_nome: string | null;
  criado_em: string;
};

export type Alimentacao = AlimentacaoLinha & {
  contrato_id: string;
  arquivo_mime: string;
  transcricao_origem: string | null;
  motivo_recusa: string | null;
  decidida_em: string | null;
  decidida_por_nome: string | null;
  enviada_por_nome: string | null;
  lancamento: Lancamento | null;
};

export async function buscarAlimentacao(id: string): Promise<Alimentacao | null> {
  const supabase = await criarClienteServidor();
  const { data: a, error } = await supabase
    .from("alimentacoes")
    .select(
      `id, tipo, status, criado_em, transcricao, transcricao_origem, extracao, contrato_id, arquivo_mime,
       motivo_recusa, decidida_em, contratos(numero),
       enviada:usuarios!alimentacoes_enviada_por_fk(nome),
       decidida:usuarios!alimentacoes_decidida_por_fk(nome)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!a) return null;

  const { data: l, error: erroLancamento } = await supabase
    .from("lancamentos")
    .select("id, descricao, valor, competencia, criado_em, rubricas(nome), unidades(nome)")
    .eq("alimentacao_id", id)
    .maybeSingle();
  if (erroLancamento) throw new Error(erroLancamento.message);

  return {
    id: a.id,
    tipo: a.tipo,
    status: a.status,
    criado_em: a.criado_em,
    contrato_id: a.contrato_id,
    contrato_numero: a.contratos?.numero ?? "—",
    arquivo_mime: a.arquivo_mime,
    transcricao: a.transcricao,
    transcricao_origem: a.transcricao_origem,
    extracao: a.extracao as Extracao | null,
    motivo_recusa: a.motivo_recusa,
    decidida_em: a.decidida_em,
    enviada_por_nome: a.enviada?.nome ?? null,
    decidida_por_nome: a.decidida?.nome ?? null,
    lancamento: l
      ? {
          id: l.id,
          descricao: l.descricao,
          valor: Number(l.valor),
          competencia: l.competencia,
          criado_em: l.criado_em,
          rubrica_nome: l.rubricas?.nome ?? "—",
          unidade_nome: l.unidades?.nome ?? null,
        }
      : null,
  };
}

export type Opcao = { id: string; nome: string };

/** Rubricas ativas e as unidades (clientes) do contrato — os selects da conferência. */
export async function opcoesDeConferencia(contratoId: string): Promise<{ rubricas: Opcao[]; unidades: Opcao[] }> {
  const [rubricas, unidades] = await Promise.all([rubricasAtivas(), unidadesDoContrato(contratoId)]);
  return {
    rubricas: rubricas.map((r) => ({ id: r.id, nome: r.nome })),
    unidades,
  };
}

export async function rubricasAtivas(): Promise<Array<Opcao & { palavras_chave: string[] }>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("rubricas")
    .select("id, nome, palavras_chave")
    .eq("status", "ativo")
    .order("nome");
  if (error) throw new Error(error.message);
  // "Outras" por último: é a saída, não a primeira opção.
  return (data ?? []).sort((a, b) => Number(a.nome === "Outras") - Number(b.nome === "Outras"));
}

export async function unidadesDoContrato(contratoId: string): Promise<Opcao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("contrato_unidades")
    .select("unidades(id, nome)")
    .eq("contrato_id", contratoId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .flatMap((c) => (c.unidades ? [{ id: c.unidades.id, nome: c.unidades.nome }] : []))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Contratos ativos em que esta pessoa pode enviar alimentação (escopo pela RLS). */
export async function contratosParaEnvio(): Promise<Opcao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("contratos")
    .select("id, numero, contratantes(nome)")
    .eq("status", "ativo")
    .order("numero");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id, nome: `${c.numero} · ${c.contratantes?.nome ?? ""}` }));
}
