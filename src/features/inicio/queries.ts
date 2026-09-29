import "server-only";

import { COM_PRAZO_CORRENDO, FINAIS } from "@/features/solicitacoes/fluxo";
import { criarClienteServidor } from "@/lib/supabase/server";

import { campanhasMaisUrgentes, type Campanha, type PendenciaComEscopo } from "./campanhas";

/**
 * Números do início da equipe interna. Client do usuário, sempre: cada
 * contagem é o que a RLS deixa esta pessoa ver — o mesmo que ela encontra ao
 * clicar no contador e abrir a tela.
 *
 * Contagem é `count: "exact", head: true`, nunca `length` de linhas trazidas:
 * o PostgREST corta resposta em `max_rows` (1000), e o contador pararia ali.
 */

async function contar(consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await consulta;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const FINAIS_PG = `(${FINAIS.join(",")})`;

export async function filaDeSolicitacoes(usuarioId: string, hoje: string) {
  const supabase = await criarClienteServidor();
  const base = () => supabase.from("solicitacoes").select("id", { count: "exact", head: true });
  const [comVoce, semResponsavel, vencidas] = await Promise.all([
    contar(base().eq("responsavel_id", usuarioId).not("status", "in", FINAIS_PG)),
    contar(base().is("responsavel_id", null).not("status", "in", FINAIS_PG)),
    contar(base().in("status", [...COM_PRAZO_CORRENDO]).lt("prazo", hoje)),
  ]);
  return { comVoce, semResponsavel, vencidas };
}

/** Pares documento × pessoa sem resposta — o mesmo total do relatório de pendências. */
export async function filaDeCiencia(hoje: string) {
  const supabase = await criarClienteServidor();
  const base = () => supabase.rpc("relatorio_pendencias_de_ciencia", undefined, { count: "exact", head: true });
  const [pendentes, vencidas] = await Promise.all([contar(base()), contar(base().lt("prazo_ciencia", hoje))]);
  return { pendentes, vencidas };
}

export async function contarRascunhos() {
  const supabase = await criarClienteServidor();
  return contar(supabase.from("documentos").select("id", { count: "exact", head: true }).eq("status", "rascunho"));
}

/** Competência (aaaa-mm-01) do último espelho publicado que esta pessoa enxerga. */
export async function ultimoFechamento(): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("documentos")
    .select("competencia, documento_tipos!inner(chave)")
    .eq("documento_tipos.chave", "espelho_ponto")
    .eq("status", "publicado")
    .not("competencia", "is", null)
    .order("competencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.competencia ?? null;
}

export type ProgressoDeCampanha = Campanha & { respondidos: number; total: number };

/**
 * As campanhas de ciência mais urgentes, com quantos já responderam.
 *
 * Coletivo: `resumo_do_documento` — o mesmo número da tela do documento.
 * Individual (espelhos de um fechamento): documentos publicados do grupo e,
 * deles, os que ainda aparecem nas pendências; cada um alcança uma pessoa só.
 */
export async function campanhasDeCiencia(limite: number): Promise<ProgressoDeCampanha[]> {
  const supabase = await criarClienteServidor();

  // Já vem por prazo; as primeiras linhas bastam para achar os grupos mais urgentes.
  const { data: pendencias, error } = await supabase
    .rpc("relatorio_pendencias_de_ciencia")
    .select("documento_id, titulo, tipo_nome, prazo_ciencia");
  if (error) throw new Error(error.message);
  if (!pendencias || pendencias.length === 0) return [];

  const ids = [...new Set(pendencias.map((p) => p.documento_id))];
  const escopos = new Map<string, { escopo: "individual" | "coletivo"; tipo_id: string }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error: e } = await supabase
      .from("documentos")
      .select("id, escopo, tipo_id")
      .in("id", ids.slice(i, i + 300));
    if (e) throw new Error(e.message);
    for (const d of data ?? []) escopos.set(d.id, { escopo: d.escopo, tipo_id: d.tipo_id });
  }

  const linhas: PendenciaComEscopo[] = pendencias.flatMap((p) => {
    const e = escopos.get(p.documento_id);
    return e ? [{ ...p, ...e }] : [];
  });

  return Promise.all(
    campanhasMaisUrgentes(linhas, limite).map(async (c): Promise<ProgressoDeCampanha> => {
      if (c.escopo === "coletivo") {
        const { data, error: e } = await supabase.rpc("resumo_do_documento", { p_documento: c.documento_id });
        if (e) throw new Error(e.message);
        const r = data?.[0];
        return { ...c, total: r?.destinatarios ?? 0, respondidos: (r?.confirmadas ?? 0) + (r?.divergencias ?? 0) };
      }
      const [total, pendentes] = await Promise.all([
        contar(
          supabase
            .from("documentos")
            .select("id", { count: "exact", head: true })
            .eq("status", "publicado")
            .eq("escopo", "individual")
            .eq("tipo_id", c.tipo_id)
            .eq("titulo", c.titulo),
        ),
        contar(
          supabase
            .rpc("relatorio_pendencias_de_ciencia", undefined, { count: "exact", head: true })
            .eq("tipo_nome", c.tipo_nome)
            .eq("titulo", c.titulo),
        ),
      ]);
      return { ...c, total, respondidos: Math.max(0, total - pendentes) };
    }),
  );
}
