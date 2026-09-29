import "server-only";

import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { criarClienteServidor } from "@/lib/supabase/server";

import { conformidade, type DocumentoQueVence, type LinhaDeConformidade, type Lotacao } from "./conformidade";

/**
 * Painel de conformidade (F5.2). Client do usuário: a RLS de `documentos`
 * já recorta categoria (ASO é `medico`) e escopo, e a de `alocacoes` o
 * escopo. O painel não filtra permissão nenhuma por conta própria.
 */
export async function painelDeConformidade(): Promise<LinhaDeConformidade[]> {
  const supabase = await criarClienteServidor();
  const hoje = hojeEmBrasilia();

  const { data: docs, error } = await supabase
    .from("documentos")
    .select("id, titulo, tipo_id, pessoa_id, valido_ate, documento_tipos!inner(nome, validade), pessoas(nome)")
    .eq("status", "publicado")
    .eq("escopo", "individual")
    .not("valido_ate", "is", null)
    .not("documento_tipos.validade", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);

  const documentos: DocumentoQueVence[] = (docs ?? []).flatMap((d) =>
    d.pessoa_id && d.valido_ate && d.documento_tipos.validade
      ? [
          {
            id: d.id,
            titulo: d.titulo,
            tipo_id: d.tipo_id,
            tipo_nome: d.documento_tipos.nome,
            regra: d.documento_tipos.validade as DocumentoQueVence["regra"],
            pessoa_id: d.pessoa_id,
            pessoa_nome: d.pessoas?.nome ?? "—",
            valido_ate: d.valido_ate,
          },
        ]
      : [],
  );
  if (documentos.length === 0) return [];

  const pessoas = [...new Set(documentos.map((d) => d.pessoa_id))];
  const { data: alocs, error: erroAloc } = await supabase
    .from("alocacoes")
    .select("pessoa_id, contrato_id, unidade_id, status, data_fim, contratos(numero), unidades(nome)")
    .in("pessoa_id", pessoas)
    .neq("status", "encerrada");
  if (erroAloc) throw new Error(erroAloc.message);

  const lotacoes: Lotacao[] = (alocs ?? [])
    .filter((a) => !a.data_fim || a.data_fim >= hoje)
    .map((a) => ({
      pessoa_id: a.pessoa_id,
      contrato_id: a.contrato_id,
      contrato_numero: a.contratos?.numero ?? "—",
      unidade_id: a.unidade_id,
      unidade_nome: a.unidades?.nome ?? "—",
    }));

  return conformidade(documentos, lotacoes, hoje);
}
