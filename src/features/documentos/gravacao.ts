import "server-only";

import { ErroDeNegocio } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { caminhoNoStorage, hashDoArquivo } from "./arquivo";
import type { Publico } from "./schemas";

/**
 * Gravação de documento: rascunho + arquivo, os dois ou nenhum.
 *
 * Saiu de `actions.ts` quando a publicação de espelhos em lote (F4.1)
 * passou a precisar do mesmo caminho — publicar espelho é publicar documento,
 * e a garantia (a RLS decide antes do upload) não pode existir em duas
 * cópias.
 */

export const BUCKET = "documentos";

/**
 * Traduz erro do Postgres em mensagem de usuário.
 *
 * `55000` é levantado pelos triggers da 0015, com texto já escrito para a
 * tela — é o único código cuja mensagem passa adiante.
 */
export function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
  if (codigo === "55000") return mensagem;
  if (codigo === "42501") {
    return "Você não pode publicar este tipo de documento para esta pessoa. Confira se a categoria é liberada para o seu perfil e se a pessoa está no seu escopo.";
  }
  if (codigo === "23505") {
    return "Este documento já tem uma retificação. Abra a versão mais recente para corrigir.";
  }
  if (codigo === "23503") {
    return "A pessoa, o contrato ou a unidade escolhida não existe mais. Recarregue a página e escolha de novo.";
  }
  console.error("[documentos] erro de banco não traduzido", codigo, mensagem);
  return "Não foi possível salvar o documento. Tente novamente em alguns minutos ou abra um chamado com o suporte.";
}

export type NovoDocumento = {
  orgId: string;
  tipoId: string;
  escopo: "individual" | "coletivo";
  pessoaId: string | null;
  titulo: string;
  descricao: string | null;
  substituiId: string | null;
  /** 1º dia do mês de referência — espelho de ponto (F4.1). */
  competencia?: string | null;
  publicos: Publico[];
  conteudo: Uint8Array;
};

/**
 * Cria o rascunho e sobe o arquivo — os dois, ou nenhum.
 *
 * O supabase-js não abre transação que abranja banco e Storage, então a
 * ordem é o que dá a garantia: linha primeiro (a RLS decide), público,
 * arquivo por último. Qualquer falha depois da linha apaga a linha — rascunho
 * pode ser apagado, e o `on delete cascade` leva o público junto.
 */
export async function gravarRascunho(novo: NovoDocumento): Promise<string> {
  const supabase = await criarClienteServidor();

  const { data: tipo, error: erroTipo } = await supabase
    .from("documento_tipos")
    .select("chave")
    .eq("id", novo.tipoId)
    .maybeSingle();
  if (erroTipo) throw new Error(erroTipo.message);
  if (!tipo) throw new ErroDeNegocio("Tipo de documento não encontrado. Recarregue a página.");

  const id = crypto.randomUUID();
  const caminho = caminhoNoStorage(novo.orgId, tipo.chave, id);

  const { error: erroInsert } = await supabase.from("documentos").insert({
    id,
    org_id: novo.orgId,
    tipo_id: novo.tipoId,
    escopo: novo.escopo,
    pessoa_id: novo.pessoaId,
    titulo: novo.titulo,
    descricao: novo.descricao,
    substitui_id: novo.substituiId,
    competencia: novo.competencia ?? null,
    arquivo_path: caminho,
    arquivo_hash: hashDoArquivo(novo.conteudo),
    arquivo_bytes: novo.conteudo.byteLength,
    status: "rascunho",
  });
  if (erroInsert) {
    throw new ErroDeNegocio(traduzirErroDeBanco(erroInsert.code, erroInsert.message));
  }

  const desfazer = async () => {
    const { error } = await supabase.from("documentos").delete().eq("id", id);
    if (error) console.error("[documentos] rascunho órfão não apagado", id, error.message);
  };

  if (novo.escopo === "coletivo") {
    const { error } = await supabase.from("documento_destinatarios").insert(
      novo.publicos.map((p) => ({
        documento_id: id,
        contrato_id: p.contrato_id,
        unidade_id: p.unidade_id,
        funcao: p.funcao,
      })),
    );
    if (error) {
      await desfazer();
      throw new ErroDeNegocio(traduzirErroDeBanco(error.code, error.message));
    }
  }

  const { error: erroUpload } = await criarClienteAdmin()
    .storage.from(BUCKET)
    .upload(caminho, novo.conteudo, { contentType: "application/pdf", upsert: false });
  if (erroUpload) {
    console.error("[documentos] upload falhou", id, erroUpload.message);
    await desfazer();
    throw new ErroDeNegocio(
      "Não foi possível guardar o arquivo. Tente novamente em alguns minutos.",
    );
  }

  return id;
}

