import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

import type { PessoaParaCasar, Regra } from "./casamento";

/**
 * Leituras da publicação de espelhos (F4.1). Client do usuário: a RLS
 * decide quem ele alcança — um interno com escopo no 042 só casa arquivo com
 * gente do 042, e o resto aparece como "sem pessoa".
 */

/** Usado se a organização ainda não tem regra salva: o CPF em qualquer lugar do nome. */
export const REGRA_PADRAO: Regra = {
  expressao: "(\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2})",
  campo: "cpf",
};

export async function regraDaOrganizacao(): Promise<Regra> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("regras_espelho").select("expressao, campo").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return REGRA_PADRAO;
  return { expressao: data.expressao, campo: data.campo === "matricula" ? "matricula" : "cpf" };
}

export async function tipoEspelhoId(): Promise<string> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("documento_tipos")
    .select("id")
    .eq("chave", "espelho_ponto")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Tipo espelho_ponto não cadastrado nesta organização.");
  return data.id;
}

export type DadosDoLote = {
  pessoas: PessoaParaCasar[];
  esperadas: { id: string; nome: string }[];
  jaPublicadas: Set<string>;
};

/**
 * Quem pode receber, quem deveria receber e quem já recebeu.
 *
 * "Esperadas" são pessoas ativas com alocação vigente — no contrato
 * escolhido, se houver. É a lista de "pessoas sem espelho" do resumo.
 */
export async function dadosDoLote(competencia: string, contratoId: string | null): Promise<DadosDoLote> {
  const supabase = await criarClienteServidor();
  const tipoId = await tipoEspelhoId();

  const [pessoas, publicados] = await Promise.all([
    supabase
      .from("pessoas")
      .select("id, nome, cpf, matricula, alocacoes(contrato_id, status)")
      .eq("status", "ativo"),
    supabase
      .from("documentos")
      .select("pessoa_id")
      .eq("tipo_id", tipoId)
      .eq("competencia", competencia)
      .eq("status", "publicado"),
  ]);
  if (pessoas.error) throw new Error(pessoas.error.message);
  if (publicados.error) throw new Error(publicados.error.message);

  const lista = pessoas.data ?? [];
  return {
    pessoas: lista.map((p) => ({ id: p.id, nome: p.nome, cpf: p.cpf, matricula: p.matricula })),
    esperadas: lista
      .filter((p) =>
        (p.alocacoes ?? []).some(
          (a) => a.status !== "encerrada" && (contratoId === null || a.contrato_id === contratoId),
        ),
      )
      .map((p) => ({ id: p.id, nome: p.nome })),
    jaPublicadas: new Set((publicados.data ?? []).flatMap((d) => (d.pessoa_id ? [d.pessoa_id] : []))),
  };
}
