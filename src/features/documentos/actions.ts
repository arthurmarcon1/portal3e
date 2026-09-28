"use server";

import { revalidatePath } from "next/cache";

import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/sessao";
import { ErroDeNegocio, mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { caminhoNoStorage, ErroDeArquivo, hashDoArquivo, validarPdf } from "./arquivo";
import {
  esquemaId,
  esquemaPublicacao,
  esquemaRascunho,
  esquemaRetificacao,
  primeiraMensagem,
  type Publico,
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

const BUCKET = "documentos";

function revalidar(id?: string) {
  revalidatePath("/admin/documentos");
  if (id) revalidatePath(`/admin/documentos/${id}`);
}

/**
 * Traduz erro do Postgres em mensagem de usuário.
 *
 * `55000` é levantado pelos triggers da 0015, com texto já escrito para a
 * tela — é o único código cuja mensagem passa adiante.
 */
function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
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

type NovoDocumento = {
  orgId: string;
  tipoId: string;
  escopo: "individual" | "coletivo";
  pessoaId: string | null;
  titulo: string;
  descricao: string | null;
  substituiId: string | null;
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
async function gravarRascunho(novo: NovoDocumento): Promise<string> {
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
  const { documento_id, prazo_ciencia } = validado.data;

  try {
    await exigirPermissao("documentos", "editar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("documentos")
      .update({ status: "publicado", prazo_ciencia })
      .eq("id", documento_id)
      .eq("status", "rascunho")
      .select("titulo, versao, escopo, substitui_id, prazo_ciencia, tipo_id");
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
