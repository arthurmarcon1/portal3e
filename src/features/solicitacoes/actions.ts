"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ErroDeAnexo, validarAnexo } from "@/features/documentos/anexo";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao, exigirUsuario } from "@/lib/auth/sessao";
import { primeiraMensagem, uuid } from "@/lib/campos-zod";
import { ErroDeNegocio, mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { ROTULO_TIPO, TIPOS_CONTRATANTE, TIPOS_FUNCIONARIO, TRANSICOES, type StatusSolicitacao } from "./fluxo";

/**
 * Solicitações (F4.2), nas três áreas.
 *
 * Ordem de sempre: Zod → exigirUsuario/exigirPermissao → operação com o
 * client do usuário (a RLS da 0020 decide) → auditoria → revalidatePath.
 *
 * **A mudança de status não é gravada aqui na linha do tempo**: quem grava o
 * evento é o trigger `trg_solicitacao_status` (0001), e a atribuição, o
 * `trg_solicitacao_atribuicao` (0020). O que esta camada grava é a
 * `auditoria` — invariante 6: "mudança de status de solicitação" é ação
 * relevante. São registros diferentes: a linha do tempo é o que o solicitante
 * lê; a auditoria é a trilha do sistema.
 *
 * **Onde entra `service_role`** (invariante 2): só no upload do anexo para o
 * bucket `anexos`, que não tem policy para ninguém. A linha em `anexos` sai
 * pelo client do usuário (policy da 0017: a solicitação precisa ser visível a
 * ele).
 */

function revalidar(id?: string) {
  for (const base of ["/admin/solicitacoes", "/pedidos", "/cliente/solicitacoes"]) {
    revalidatePath(base);
    if (id) revalidatePath(`${base}/${id}`);
  }
}

function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
  // 55000: mensagens escritas para a tela nos triggers e funções da 0020.
  if (codigo === "55000") return mensagem;
  if (codigo === "42501") {
    return "Você não pode fazer isso nesta solicitação. Confira se ela está no seu escopo.";
  }
  if (codigo === "23503") return "O contrato, a unidade ou a pessoa escolhida não existe mais. Recarregue a página.";
  console.error("[solicitacoes] erro de banco não traduzido", codigo, mensagem);
  return "Não foi possível salvar. Tente novamente em alguns minutos ou abra um chamado com o suporte.";
}

// =====================================================================
// Abrir
// =====================================================================

const esquemaAbertura = z.object({
  tipo: z.enum([...TIPOS_FUNCIONARIO, ...TIPOS_CONTRATANTE] as [string, ...string[]], {
    message: "Escolha o tipo de pedido.",
  }),
  titulo: z.string().trim().max(200).optional().default(""),
  descricao: z
    .string()
    .trim()
    .min(10, "Explique o pedido com pelo menos 10 caracteres.")
    .max(4000, "A explicação pode ter no máximo 4.000 caracteres."),
  contrato_id: uuid.nullable().optional().default(null),
  unidade_id: uuid.nullable().optional().default(null),
});

export async function abrirSolicitacao(
  formData: FormData,
): Promise<Resultado<{ id: string; protocolo: string }>> {
  const validado = esquemaAbertura.safeParse({
    tipo: formData.get("tipo"),
    titulo: formData.get("titulo") ?? undefined,
    descricao: formData.get("descricao"),
    contrato_id: formData.get("contrato_id") || null,
    unidade_id: formData.get("unidade_id") || null,
  });
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const entrada = validado.data;

  try {
    const usuario = await exigirUsuario();

    let linha;
    if (usuario.tipo === "funcionario") {
      if (!TIPOS_FUNCIONARIO.includes(entrada.tipo as never) || !usuario.pessoaId) {
        return { ok: false, erro: "Escolha um dos tipos de pedido da lista." };
      }
      linha = {
        tipo: entrada.tipo,
        titulo: ROTULO_TIPO[entrada.tipo as keyof typeof ROTULO_TIPO],
        pessoa_id: usuario.pessoaId,
        contrato_id: null,
        unidade_id: null,
      };
    } else if (usuario.tipo === "contratante") {
      await exigirPermissao("solicitacoes", "criar");
      if (!TIPOS_CONTRATANTE.includes(entrada.tipo as never)) {
        return { ok: false, erro: "Escolha ocorrência ou substituição." };
      }
      if (!entrada.contrato_id) return { ok: false, erro: "Escolha o contrato." };
      if (!entrada.titulo) return { ok: false, erro: "Dê um título curto ao pedido." };
      linha = {
        tipo: entrada.tipo,
        titulo: entrada.titulo,
        pessoa_id: null,
        contrato_id: entrada.contrato_id,
        unidade_id: entrada.unidade_id,
      };
    } else {
      return { ok: false, erro: "A equipe interna trata os pedidos pela caixa de entrada." };
    }

    // O anexo é conferido antes de gravar qualquer coisa.
    const arquivo = formData.get("anexo");
    let anexo: { conteudo: Uint8Array; mime: string; extensao: string } | null = null;
    if (arquivo instanceof File && arquivo.size > 0) {
      const conteudo = new Uint8Array(await arquivo.arrayBuffer());
      anexo = { conteudo, ...validarAnexo(conteudo) };
    }

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase
      .from("solicitacoes")
      .insert({
        ...linha,
        tipo: linha.tipo as never,
        org_id: usuario.orgId,
        descricao: entrada.descricao,
        aberta_por: usuario.id,
      })
      .select("id, protocolo")
      .single();
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    let aviso = false;
    if (anexo) aviso = !(await anexar(usuario.orgId, usuario.id, data.id, anexo));

    await registrarAuditoria({
      acao: "criar",
      entidade: "solicitacoes",
      entidadeId: data.id,
      detalhes: { tipo: linha.tipo, protocolo: data.protocolo, anexo: Boolean(anexo) },
    });

    revalidar();
    if (aviso) {
      return {
        ok: false,
        erro: `O pedido ${data.protocolo} foi aberto, mas o anexo não foi enviado. Envie o arquivo pelo chamado informando o protocolo.`,
      };
    }
    return { ok: true, dados: { id: data.id, protocolo: data.protocolo } };
  } catch (erro) {
    if (erro instanceof ErroDeAnexo) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Sobe o anexo e registra. Nunca lança: o pedido já existe. */
async function anexar(
  orgId: string,
  usuarioId: string,
  solicitacaoId: string,
  anexo: { conteudo: Uint8Array; mime: string; extensao: string },
): Promise<boolean> {
  const caminho = `${orgId}/solicitacoes/${solicitacaoId}/${crypto.randomUUID()}.${anexo.extensao}`;
  const admin = criarClienteAdmin();
  const { error: erroUpload } = await admin.storage
    .from("anexos")
    .upload(caminho, anexo.conteudo, { contentType: anexo.mime, upsert: false });
  if (erroUpload) {
    console.error("[solicitacoes] upload do anexo falhou", solicitacaoId, erroUpload.message);
    return false;
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anexos").insert({
    org_id: orgId,
    solicitacao_id: solicitacaoId,
    nome: `anexo.${anexo.extensao}`,
    arquivo_path: caminho,
    mime: anexo.mime,
    bytes: anexo.conteudo.byteLength,
    enviado_por: usuarioId,
  });
  if (error) {
    console.error("[solicitacoes] registro do anexo falhou", solicitacaoId, error.message);
    await admin.storage.from("anexos").remove([caminho]);
    return false;
  }
  return true;
}

// =====================================================================
// Responder (solicitante)
// =====================================================================

const esquemaResposta = z.object({
  solicitacao_id: uuid,
  texto: z.string().trim().min(5, "Escreva a sua resposta.").max(4000),
});

export async function responderSolicitacao(entrada: unknown): Promise<Resultado> {
  const validado = esquemaResposta.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { solicitacao_id, texto } = validado.data;

  try {
    await exigirUsuario();
    const supabase = await criarClienteServidor();
    // Comentário + volta para análise numa transação (0020). O evento de
    // status sai do trigger.
    const { error } = await supabase.rpc("responder_solicitacao", {
      p_solicitacao: solicitacao_id,
      p_texto: texto,
    });
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "mudar_status",
      entidade: "solicitacoes",
      entidadeId: solicitacao_id,
      detalhes: { de: "pendente_solicitante", para: "em_analise", pela: "resposta do solicitante" },
    });
    revalidar(solicitacao_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Tratar (interno)
// =====================================================================

const esquemaStatus = z.object({
  solicitacao_id: uuid,
  status: z.enum(Object.keys(TRANSICOES) as [StatusSolicitacao, ...StatusSolicitacao[]]),
  comentario: z.string().trim().max(4000).optional().default(""),
});

export async function mudarStatusSolicitacao(entrada: unknown): Promise<Resultado> {
  const validado = esquemaStatus.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { solicitacao_id, status, comentario } = validado.data;

  try {
    const usuario = await exigirPermissao("solicitacoes", "editar");
    const supabase = await criarClienteServidor();

    const { data: atual, error: erroLeitura } = await supabase
      .from("solicitacoes")
      .select("status")
      .eq("id", solicitacao_id)
      .maybeSingle();
    if (erroLeitura) throw new Error(erroLeitura.message);
    if (!atual) throw new ErroDeNegocio("Solicitação não encontrada.");

    // O comentário que explica a mudança entra antes, para ler em ordem.
    if (comentario) {
      const { error } = await supabase.from("solicitacao_eventos").insert({
        solicitacao_id,
        usuario_id: usuario.id,
        tipo: "comentario",
        conteudo: comentario,
        interno: false,
      });
      if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    }

    const { data, error } = await supabase
      .from("solicitacoes")
      .update({ status })
      .eq("id", solicitacao_id)
      .select("id");
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data.length) return { ok: false, erro: "Você não pode mudar esta solicitação. Confira se ela está no seu escopo." };

    await registrarAuditoria({
      acao: "mudar_status",
      entidade: "solicitacoes",
      entidadeId: solicitacao_id,
      detalhes: { de: atual.status, para: status },
    });
    revalidar(solicitacao_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaAtribuicao = z.object({ solicitacao_id: uuid, responsavel_id: uuid.nullable() });

export async function atribuirResponsavel(entrada: unknown): Promise<Resultado> {
  const validado = esquemaAtribuicao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { solicitacao_id, responsavel_id } = validado.data;

  try {
    await exigirPermissao("solicitacoes", "editar");
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase
      .from("solicitacoes")
      .update({ responsavel_id })
      .eq("id", solicitacao_id)
      .select("id");
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data.length) return { ok: false, erro: "Você não pode mudar esta solicitação. Confira se ela está no seu escopo." };

    await registrarAuditoria({
      acao: "atribuir",
      entidade: "solicitacoes",
      entidadeId: solicitacao_id,
      detalhes: { responsavel_id },
    });
    revalidar(solicitacao_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

const esquemaComentario = z.object({
  solicitacao_id: uuid,
  texto: z.string().trim().min(2, "Escreva o comentário.").max(4000),
  // Sem o campo, é nota interna (0026): esquecer esconde, não expõe.
  interno: z.boolean().default(true),
});

export async function comentarSolicitacao(entrada: unknown): Promise<Resultado> {
  const validado = esquemaComentario.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { solicitacao_id, texto, interno } = validado.data;

  try {
    const usuario = await exigirPermissao("solicitacoes", "editar");
    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("solicitacao_eventos").insert({
      solicitacao_id,
      usuario_id: usuario.id,
      tipo: "comentario",
      conteudo: texto,
      interno,
    });
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    revalidar(solicitacao_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
