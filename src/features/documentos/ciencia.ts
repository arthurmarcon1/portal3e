"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { extrairIp, registrarAuditoria } from "@/lib/audit";
import { exigirUsuario } from "@/lib/auth/sessao";
import { mensagemDeErro, type Resultado } from "@/lib/erros";
import { primeiraMensagem, uuid } from "@/lib/campos-zod";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { ErroDeAnexo, validarImagem } from "./anexo";
import { MINIMO_JUSTIFICATIVA } from "./ciencia-regras";

/**
 * Registro de ciência (F3.4).
 *
 * Zod → exigirUsuario → `public.registrar_ciencia` → auditoria →
 * revalidatePath. A função do banco grava a ciência e, na divergência, a
 * solicitação vinculada numa transação só — ciência é imutável, então não
 * pode existir ciência gravada com solicitação que falhou. Versão e hash vêm
 * do documento, não daqui.
 *
 * **Esta action é o único caminho de escrita em `ciencias`** (0018).
 * `authenticated` não insere na tabela nem executa a função: o IP e o
 * user-agent da prova saem do request que chegou a este servidor, e o
 * usuário, da sessão validada aqui (`exigirUsuario` → `auth.getUser()`).
 * Nada disso vem do navegador — evidência que o próprio interessado escolhe
 * não é evidência.
 *
 * **Onde entra `service_role`, e por quê** (invariante 2): (1) a chamada a
 * `registrar_ciencia`, que só `service_role` executa. Sem a RLS de quem
 * responde no caminho, a própria função confere que o usuário é funcionário
 * ativo e que o documento chega à pessoa dele — as mesmas peças de
 * `documentos_leitura`. (2) O upload da foto para o bucket `anexos`, que não
 * tem policy para ninguém; o registro em `anexos` sai pelo client do
 * usuário, e a policy (0017) exige que a solicitação seja dele.
 */

const esquemaCiencia = z.discriminatedUnion("tipo", [
  z.object({ documento_id: uuid, tipo: z.literal("confirmacao") }),
  z.object({
    documento_id: uuid,
    tipo: z.literal("divergencia"),
    justificativa: z
      .string()
      .trim()
      .min(
        MINIMO_JUSTIFICATIVA,
        `Explique a divergência com pelo menos ${MINIMO_JUSTIFICATIVA} caracteres.`,
      )
      .max(2000, "A explicação pode ter no máximo 2.000 caracteres."),
  }),
]);

export type CienciaRegistrada = {
  protocolo: string;
  respondido_em: string;
  solicitacao_protocolo: string | null;
  /** A ciência entrou, mas a foto não — a tela avisa sem esconder o protocolo. */
  aviso: string | null;
};

function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
  // 55000: texto escrito para a tela, na própria função (0017).
  if (codigo === "55000") return mensagem;
  if (codigo === "42501") {
    return "Não foi possível registrar sua resposta para este documento. Fale com o RH pelo chamado.";
  }
  console.error("[ciencia] erro de banco não traduzido", codigo, mensagem);
  return "Não foi possível registrar sua resposta. Tente novamente em alguns minutos.";
}

export async function registrarCiencia(
  formData: FormData,
): Promise<Resultado<CienciaRegistrada>> {
  const validado = esquemaCiencia.safeParse({
    documento_id: formData.get("documento_id"),
    tipo: formData.get("tipo"),
    justificativa: formData.get("justificativa") ?? undefined,
  });
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const entrada = validado.data;

  try {
    const usuario = await exigirUsuario();
    if (usuario.tipo !== "funcionario") {
      return { ok: false, erro: "Só o funcionário a quem o documento foi enviado pode dar ciência." };
    }

    // A foto é conferida ANTES da ciência: depois de gravada, a ciência não
    // volta, e foto inválida não pode deixar a pessoa com meio registro.
    const arquivo = formData.get("foto");
    let foto: { conteudo: Uint8Array; mime: string; extensao: string } | null = null;
    if (entrada.tipo === "divergencia" && arquivo instanceof File && arquivo.size > 0) {
      const conteudo = new Uint8Array(await arquivo.arrayBuffer());
      foto = { conteudo, ...validarImagem(conteudo) };
    }

    const cabecalhos = await headers();
    const { data, error } = await criarClienteAdmin().rpc("registrar_ciencia", {
      p_usuario: usuario.id,
      p_documento: entrada.documento_id,
      p_tipo: entrada.tipo,
      p_justificativa: entrada.tipo === "divergencia" ? entrada.justificativa : "",
      p_ip: extrairIp(cabecalhos),
      p_user_agent: cabecalhos.get("user-agent") ?? "",
    });
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    const registro = data?.[0];
    if (!registro) return { ok: false, erro: "Não foi possível registrar sua resposta. Tente novamente." };

    await registrarAuditoria({
      acao: "ciencia",
      entidade: "ciencias",
      entidadeId: registro.ciencia_id,
      detalhes: {
        documento_id: entrada.documento_id,
        tipo: entrada.tipo,
        protocolo: registro.protocolo,
        solicitacao_id: registro.solicitacao_id,
      },
    });

    let aviso: string | null = null;
    if (foto) {
      aviso = registro.solicitacao_id
        ? await anexarFoto(usuario.orgId, usuario.id, registro.solicitacao_id, foto)
        : "Sua divergência foi registrada, mas este tipo de documento não abre solicitação, então a foto não foi guardada.";
    }

    revalidatePath("/inicio");
    revalidatePath(`/documentos/${entrada.documento_id}`);
    return {
      ok: true,
      dados: {
        protocolo: registro.protocolo,
        respondido_em: registro.respondido_em,
        solicitacao_protocolo: registro.solicitacao_protocolo,
        aviso,
      },
    };
  } catch (erro) {
    if (erro instanceof ErroDeAnexo) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/**
 * Sobe a foto e registra o anexo. Nunca lança: a ciência já está gravada, e
 * falha aqui vira aviso na tela de protocolo, não erro.
 */
async function anexarFoto(
  orgId: string,
  usuarioId: string,
  solicitacaoId: string,
  foto: { conteudo: Uint8Array; mime: string; extensao: string },
): Promise<string | null> {
  const falhou =
    "Sua divergência foi registrada, mas a foto não foi enviada. Envie a foto ao RH pelo chamado, informando o protocolo.";
  const caminho = `${orgId}/solicitacoes/${solicitacaoId}/${crypto.randomUUID()}.${foto.extensao}`;

  const { error: erroUpload } = await criarClienteAdmin()
    .storage.from("anexos")
    .upload(caminho, foto.conteudo, { contentType: foto.mime, upsert: false });
  if (erroUpload) {
    console.error("[ciencia] upload da foto falhou", solicitacaoId, erroUpload.message);
    return falhou;
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anexos").insert({
    org_id: orgId,
    solicitacao_id: solicitacaoId,
    nome: `foto-da-divergencia.${foto.extensao}`,
    arquivo_path: caminho,
    mime: foto.mime,
    bytes: foto.conteudo.byteLength,
    enviado_por: usuarioId,
  });
  if (error) {
    console.error("[ciencia] registro do anexo falhou", solicitacaoId, error.message);
    await criarClienteAdmin().storage.from("anexos").remove([caminho]);
    return falhou;
  }
  return null;
}
