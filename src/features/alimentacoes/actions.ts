"use server";

import { revalidatePath } from "next/cache";

import { hashDoArquivo } from "@/features/documentos/arquivo";
import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/sessao";
import { ErroDeNegocio, mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { extrair, type Extracao } from "./extracao";
import { ErroDeOriginal, validarOriginal } from "./original";
import { rubricasAtivas, unidadesDoContrato } from "./queries";
import {
  esquemaConferencia,
  esquemaEnvio,
  esquemaRecusa,
  esquemaTranscricao,
  primeiraMensagem,
} from "./schemas";
import { transcricaoDisponivel, transcrever } from "./transcricao";

/**
 * Mutações do Conecta (0029).
 *
 * Ordem de sempre (CLAUDE.md): Zod → exigirPermissao → operação com o client
 * do usuário (a RLS ainda vale) → registrarAuditoria → revalidatePath.
 * `service_role` só para o arquivo: o bucket `alimentacoes` não tem policy
 * para ninguém (invariante 3).
 */

const BUCKET = "alimentacoes";

async function sugestao(texto: string, contratoId: string): Promise<Extracao> {
  const [rubricas, unidades] = await Promise.all([rubricasAtivas(), unidadesDoContrato(contratoId)]);
  return extrair(texto, { rubricas, unidades, hoje: new Date(`${hojeEmBrasilia()}T12:00:00Z`) });
}

function revalidar(id?: string) {
  revalidatePath("/admin/alimentacoes");
  if (id) revalidatePath(`/admin/alimentacoes/${id}`);
}

// ---------------------------------------------------------------------
// Enviar
// ---------------------------------------------------------------------

export type ResultadoEnvio = Resultado<{ id: string; aviso: string | null }>;

/**
 * Recebe o áudio ou a foto, guarda o original, transcreve (se houver chave),
 * sugere os campos e cria a alimentação pendente.
 *
 * Falha da transcrição NÃO impede o envio: o original é o que importa
 * guardar. A alimentação nasce sem texto e a equipe digita na conferência.
 */
export async function enviarAlimentacao(formulario: FormData): Promise<ResultadoEnvio> {
  const validado = esquemaEnvio.safeParse({ contrato_id: formulario.get("contrato_id") });
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha o áudio ou a foto que o produtor mandou." };
  }

  let caminho: string | null = null;
  try {
    const usuario = await exigirPermissao("alimentacoes", "criar");
    const conteudo = new Uint8Array(await arquivo.arrayBuffer());
    const original = validarOriginal(conteudo);

    let transcricao: { texto: string; origem: string } | null = null;
    let aviso: string | null = null;
    if (original.tipo === "audio") {
      if (transcricaoDisponivel()) {
        try {
          transcricao = await transcrever(conteudo, original);
        } catch (erro) {
          console.error("[alimentacoes] transcrição falhou", erro);
          aviso = "O áudio foi guardado, mas a transcrição automática falhou. Ouça e digite o que foi dito.";
        }
      } else {
        aviso = "Transcrição automática desligada neste ambiente. Ouça o áudio e digite o que foi dito.";
      }
    } else {
      aviso = "Foto guardada. Escreva o que ela mostra para o Portal sugerir os campos.";
    }

    const extracao = transcricao ? await sugestao(transcricao.texto, validado.data.contrato_id) : null;

    const id = crypto.randomUUID();
    caminho = `${usuario.orgId}/${hojeEmBrasilia().slice(0, 4)}/${id}.${original.extensao}`;
    const { error: erroUpload } = await criarClienteAdmin()
      .storage.from(BUCKET)
      .upload(caminho, conteudo, { contentType: original.mime, upsert: false });
    if (erroUpload) {
      caminho = null;
      console.error("[alimentacoes] upload falhou", erroUpload.message);
      return { ok: false, erro: "Não foi possível guardar o arquivo. Tente de novo em alguns minutos." };
    }

    const supabase = await criarClienteServidor();
    const { error } = await supabase.from("alimentacoes").insert({
      id,
      org_id: usuario.orgId,
      contrato_id: validado.data.contrato_id,
      tipo: original.tipo,
      arquivo_path: caminho,
      arquivo_mime: original.mime,
      arquivo_bytes: conteudo.byteLength,
      arquivo_hash: hashDoArquivo(conteudo),
      enviada_por: usuario.id,
      transcricao: transcricao?.texto ?? null,
      transcricao_origem: transcricao?.origem ?? null,
      extracao,
    });
    if (error) {
      console.error("[alimentacoes] insert falhou", error.code, error.message);
      throw new ErroDeNegocio(
        error.code === "42501"
          ? "Você não pode enviar alimentação neste contrato."
          : "Não foi possível registrar a alimentação. Tente de novo em alguns minutos.",
      );
    }
    caminho = null; // gravou: o arquivo fica

    await registrarAuditoria({
      acao: "criar",
      entidade: "alimentacoes",
      entidadeId: id,
      detalhes: {
        tipo: original.tipo,
        bytes: conteudo.byteLength,
        transcricao: transcricao?.origem ?? null,
        contrato_id: validado.data.contrato_id,
      },
    });
    revalidar();
    return { ok: true, dados: { id, aviso } };
  } catch (erro) {
    if (erro instanceof ErroDeOriginal) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  } finally {
    // Subiu e não gravou: o arquivo não fica órfão no bucket.
    if (caminho) await criarClienteAdmin().storage.from(BUCKET).remove([caminho]);
  }
}

// ---------------------------------------------------------------------
// Transcrição digitada ou corrigida → nova sugestão
// ---------------------------------------------------------------------

export async function corrigirTranscricao(entrada: unknown): Promise<Resultado> {
  const validado = esquemaTranscricao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  try {
    await exigirPermissao("alimentacoes", "editar");
    const supabase = await criarClienteServidor();

    const { data: atual, error: erroLeitura } = await supabase
      .from("alimentacoes")
      .select("contrato_id, transcricao, transcricao_origem")
      .eq("id", validado.data.id)
      .maybeSingle();
    if (erroLeitura) throw new Error(erroLeitura.message);
    if (!atual) return { ok: false, erro: "Alimentação não encontrada." };

    const mudou = atual.transcricao !== validado.data.transcricao;
    const extracao = await sugestao(validado.data.transcricao, atual.contrato_id);

    const { data, error } = await supabase
      .from("alimentacoes")
      .update({
        transcricao: validado.data.transcricao,
        transcricao_origem: mudou ? "manual" : atual.transcricao_origem,
        extracao,
      })
      .eq("id", validado.data.id)
      .eq("status", "pendente")
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, erro: "Esta alimentação já foi decidida e não muda mais." };

    await registrarAuditoria({
      acao: "editar",
      entidade: "alimentacoes",
      entidadeId: validado.data.id,
      detalhes: { campo: "transcricao", mudou },
    });
    revalidar(validado.data.id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// ---------------------------------------------------------------------
// Conferir → lançamento
// ---------------------------------------------------------------------

export async function conferirAlimentacao(entrada: unknown): Promise<Resultado<{ lancamentoId: string }>> {
  const validado = esquemaConferencia.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const v = validado.data;

  try {
    await exigirPermissao("alimentacoes", "editar");
    const supabase = await criarClienteServidor();

    const { data: lancamentoId, error } = await supabase.rpc("conferir_alimentacao", {
      p_alimentacao: v.id,
      p_rubrica: v.rubrica_id as string,
      p_unidade: v.unidade_id ?? null,
      p_descricao: v.descricao,
      p_valor: v.valor,
      p_competencia: v.competencia,
    });
    if (error) {
      if (error.code === "P0002") return { ok: false, erro: "Esta alimentação já foi decidida, ou você não pode conferi-la." };
      if (error.code === "22023") {
        return {
          ok: false,
          erro: /rubrica/i.test(error.message)
            ? "Escolha uma rubrica ativa."
            : "O cliente escolhido não pertence ao contrato desta alimentação.",
        };
      }
      if (error.code === "42501") return { ok: false, erro: "Você não tem permissão para conferir alimentações." };
      throw new Error(`${error.code} ${error.message}`);
    }

    await registrarAuditoria({
      acao: "conferir",
      entidade: "alimentacoes",
      entidadeId: v.id,
      detalhes: {
        lancamento_id: lancamentoId,
        rubrica_id: v.rubrica_id,
        unidade_id: v.unidade_id ?? null,
        valor: v.valor,
        competencia: v.competencia,
      },
    });
    revalidar(v.id);
    return { ok: true, dados: { lancamentoId: lancamentoId as string } };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// ---------------------------------------------------------------------
// Recusar
// ---------------------------------------------------------------------

export async function recusarAlimentacao(entrada: unknown): Promise<Resultado> {
  const validado = esquemaRecusa.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  try {
    await exigirPermissao("alimentacoes", "editar");
    const supabase = await criarClienteServidor();
    // decidida_por e decidida_em: quem grava é o trigger, com o usuário logado.
    const { data, error } = await supabase
      .from("alimentacoes")
      .update({ status: "recusada", motivo_recusa: validado.data.motivo })
      .eq("id", validado.data.id)
      .eq("status", "pendente")
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, erro: "Esta alimentação já foi decidida, ou você não pode recusá-la." };

    await registrarAuditoria({
      acao: "recusar",
      entidade: "alimentacoes",
      entidadeId: validado.data.id,
      detalhes: { motivo: validado.data.motivo },
    });
    revalidar(validado.data.id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
