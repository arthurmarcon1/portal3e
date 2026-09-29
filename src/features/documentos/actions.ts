"use server";

import { revalidatePath } from "next/cache";

import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/sessao";
import { ErroDeNegocio, mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { ErroDeArquivo, validarPdf } from "./arquivo";
import { BUCKET, gravarRascunho, traduzirErroDeBanco } from "./gravacao";
import {
  esquemaId,
  esquemaPublicacao,
  esquemaRascunho,
  esquemaRetificacao,
  primeiraMensagem,
} from "./schemas";

/**
 * Publicação de documentos (F3.1).
 *
 * Mesma ordem de toda mutação (CLAUDE.md): Zod → exigirPermissao → operação
 * com o client do usuário → registrarAuditoria → revalidatePath.
 *
 * **Onde entra `service_role`, e por quê** (invariante 2): só para gravar e
 * apagar o arquivo no bucket `documentos`. O bucket não tem policy nenhuma em
 * `storage.objects` — nenhum client fala com o Storage (invariante 3, docs/03)
 * —, então o servidor é o único caminho. E ele só chega ao Storage **depois**
 * de o client do usuário criar a linha em `documentos`: é a RLS (0015) que
 * decide categoria e escopo, e sem linha aceita não há upload.
 *
 * O ciclo de vida é garantido pelo banco, não por esta camada: rascunho só
 * nasce por insert, publicado só vira arquivado, e o carimbo de publicação,
 * o prazo padrão, a versão da retificação e a notificação saem dos triggers
 * da 0015. As checagens daqui existem para devolver mensagem boa antes.
 */

function revalidar(id?: string) {
  revalidatePath("/admin/documentos");
  if (id) revalidatePath(`/admin/documentos/${id}`);
}

/** Lê e confere o PDF do `FormData`. */
async function lerArquivo(formData: FormData): Promise<Uint8Array> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new ErroDeArquivo("Escolha o arquivo PDF do documento.");
  }
  const conteudo = new Uint8Array(await arquivo.arrayBuffer());
  validarPdf(conteudo);
  return conteudo;
}

function lerDados(formData: FormData): unknown {
  const bruto = formData.get("dados");
  if (typeof bruto !== "string") return null;
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

// =====================================================================
// Rascunho
// =====================================================================

export async function criarRascunho(formData: FormData): Promise<Resultado<{ id: string }>> {
  const validado = esquemaRascunho.safeParse(lerDados(formData));
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const entrada = validado.data;

  try {
    const usuario = await exigirPermissao("documentos", "criar");
    const conteudo = await lerArquivo(formData);

    const id = await gravarRascunho({
      orgId: usuario.orgId,
      tipoId: entrada.tipo_id,
      escopo: entrada.escopo,
      pessoaId: entrada.escopo === "individual" ? entrada.pessoa_id : null,
      titulo: entrada.titulo,
      descricao: entrada.descricao,
      substituiId: null,
      publicos: entrada.escopo === "coletivo" ? entrada.publicos : [],
      conteudo,
    });

    await registrarAuditoria({
      acao: "criar",
      entidade: "documentos",
      entidadeId: id,
      detalhes: { titulo: entrada.titulo, escopo: entrada.escopo, tipo_id: entrada.tipo_id },
    });

    revalidar();
    return { ok: true, dados: { id } };
  } catch (erro) {
    if (erro instanceof ErroDeArquivo) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/**
 * Descarta um rascunho. Publicado não se apaga — só se arquiva.
 *
 * Pede `documentos:editar`, a mesma permissão da policy de exclusão (0008,
 * mantida na 0015): rascunho nunca alcançou ninguém, e descartá-lo é parte de
 * editar. `documentos:excluir` fica para o que um dia apagar registro com
 * efeito — e hoje não há nada assim.
 */
export async function descartarRascunho(entrada: unknown): Promise<Resultado> {
  const validado = esquemaId.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { documento_id } = validado.data;

  try {
    await exigirPermissao("documentos", "editar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("documentos")
      .delete()
      .eq("id", documento_id)
      .eq("status", "rascunho")
      .select("arquivo_path, titulo");
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data.length) {
      return { ok: false, erro: "Rascunho não encontrado. Ele pode ter sido publicado ou descartado por outra pessoa." };
    }

    const { error: erroStorage } = await criarClienteAdmin()
      .storage.from(BUCKET)
      .remove([data[0].arquivo_path]);
    // O registro já saiu; um arquivo que sobrou no bucket privado não é
    // alcançável por ninguém. Avisa alto e segue.
    if (erroStorage) {
      console.error("[documentos] arquivo de rascunho não removido", data[0].arquivo_path, erroStorage.message);
    }

    await registrarAuditoria({
      acao: "excluir",
      entidade: "documentos",
      entidadeId: documento_id,
      detalhes: { titulo: data[0].titulo, status: "rascunho" },
    });

    revalidar();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Publicação
// =====================================================================

/**
 * Publica um rascunho. Não tem volta: depois disso, só arquivar ou retificar.
 *
 * `prazo_ciencia` vazio = o padrão do tipo, calculado pelo banco na data de
 * publicação. A notificação de cada destinatário entra na mesma transação
 * (trigger da 0015); publicar uma retificação arquiva a versão anterior.
 */
export async function publicarDocumento(
  entrada: unknown,
): Promise<Resultado<{ destinatarios: number }>> {
  const validado = esquemaPublicacao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { documento_id, prazo_ciencia, valido_ate } = validado.data;

  try {
    await exigirPermissao("documentos", "editar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("documentos")
      .update({ status: "publicado", prazo_ciencia, valido_ate })
      .eq("id", documento_id)
      .eq("status", "rascunho")
      .select("titulo, versao, escopo, substitui_id, prazo_ciencia, valido_ate, tipo_id");
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data.length) {
      return { ok: false, erro: "Rascunho não encontrado. Ele pode já ter sido publicado — recarregue a página." };
    }
    const publicado = data[0];

    const { data: resumo } = await supabase.rpc("resumo_do_documento", {
      p_documento: documento_id,
    });
    const destinatarios = resumo?.[0]?.destinatarios ?? 0;

    await registrarAuditoria({
      acao: "publicar",
      entidade: "documentos",
      entidadeId: documento_id,
      detalhes: {
        titulo: publicado.titulo,
        versao: publicado.versao,
        escopo: publicado.escopo,
        tipo_id: publicado.tipo_id,
        substitui_id: publicado.substitui_id,
        prazo_ciencia: publicado.prazo_ciencia,
        valido_ate: publicado.valido_ate,
        destinatarios,
      },
    });

    revalidar(documento_id);
    if (publicado.substitui_id) revalidar(publicado.substitui_id);
    return { ok: true, dados: { destinatarios } };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Tira um publicado de circulação. O registro e as ciências ficam. */
export async function arquivarDocumento(entrada: unknown): Promise<Resultado> {
  const validado = esquemaId.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { documento_id } = validado.data;

  try {
    await exigirPermissao("documentos", "editar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("documentos")
      .update({ status: "arquivado" })
      .eq("id", documento_id)
      .eq("status", "publicado")
      .select("titulo, versao");
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data.length) {
      return { ok: false, erro: "Só documento publicado pode ser arquivado. Recarregue a página." };
    }

    await registrarAuditoria({
      acao: "arquivar",
      entidade: "documentos",
      entidadeId: documento_id,
      detalhes: { titulo: data[0].titulo, versao: data[0].versao },
    });

    revalidar(documento_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Retificação
// =====================================================================

/**
 * Cria a versão seguinte de um publicado, como rascunho.
 *
 * Mesmo tipo, escopo, pessoa e público do original; arquivo novo, e título e
 * descrição podem ser corrigidos. A versão é calculada pelo banco. A anterior
 * continua publicada até a nova ser publicada — quem ainda não respondeu não
 * fica sem documento no meio do caminho.
 */
export async function retificarDocumento(
  formData: FormData,
): Promise<Resultado<{ id: string }>> {
  const validado = esquemaRetificacao.safeParse(lerDados(formData));
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const entrada = validado.data;

  try {
    const usuario = await exigirPermissao("documentos", "editar");
    const conteudo = await lerArquivo(formData);
    const supabase = await criarClienteServidor();

    const { data: original, error } = await supabase
      .from("documentos")
      .select("id, tipo_id, escopo, pessoa_id, status, versao, documento_destinatarios(contrato_id, unidade_id, funcao)")
      .eq("id", entrada.documento_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!original) throw new ErroDeNegocio("Documento não encontrado.");
    if (original.status !== "publicado") {
      throw new ErroDeNegocio("Só documento publicado pode ser retificado.");
    }

    const id = await gravarRascunho({
      orgId: usuario.orgId,
      tipoId: original.tipo_id,
      escopo: original.escopo,
      pessoaId: original.pessoa_id,
      titulo: entrada.titulo,
      descricao: entrada.descricao,
      substituiId: original.id,
      publicos: original.documento_destinatarios ?? [],
      conteudo,
    });

    await registrarAuditoria({
      acao: "retificar",
      entidade: "documentos",
      entidadeId: id,
      detalhes: { substitui_id: original.id, versao_anterior: original.versao, titulo: entrada.titulo },
    });

    revalidar(original.id);
    return { ok: true, dados: { id } };
  } catch (erro) {
    if (erro instanceof ErroDeArquivo) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
