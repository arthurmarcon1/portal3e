"use server";

import { redirect } from "next/navigation";

import { registrarAuditoria } from "@/lib/audit";
import { mensagemDeBloqueio } from "@/lib/auth/bloqueio";
import { gerarCodigo, validarCodigo, VALIDADE_MINUTOS } from "@/lib/auth/codigos";
import {
  mascararIdentificador,
  resolverIdentificador,
} from "@/lib/auth/identificador";
import { idDaOrganizacao, slugOrganizacao } from "@/lib/auth/organizacao";
import { chaveDoLogin, situacaoDoLogin } from "@/lib/auth/tentativas";
import { destinoPermitido } from "@/lib/auth/rotas";
import { exigirUsuario, rotaInicial } from "@/lib/auth/sessao";
import { enviarEmail } from "@/lib/email";
import { mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import {
  esquemaLogin,
  esquemaPedidoDeCodigo,
  esquemaRedefinicao,
  esquemaTrocaDeSenha,
  primeiraMensagem,
  type EntradaLogin,
  type EntradaPedidoDeCodigo,
  type EntradaRedefinicao,
  type EntradaTrocaDeSenha,
} from "./schemas";

const ERRO_CREDENCIAL = "CPF, e-mail ou senha incorretos. Confira e tente de novo.";
const ERRO_IDENTIFICADOR =
  "Informe um CPF com 11 dígitos ou um e-mail válido.";

/** Busca a linha de `usuarios` pelo e-mail de login, sem sessão. */
async function usuarioPorEmailLogin(email: string) {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("usuarios")
    .select("id, org_id, nome, tipo, status, pessoa_id, email_login")
    .eq("email_login", email)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

/**
 * Falha de login. `bloqueadoAte` (ISO) só vem no bloqueio por tentativas: a
 * tela usa para mostrar a contagem regressiva.
 */
export type ResultadoLogin = Resultado | { ok: false; erro: string; bloqueadoAte: string };

export async function entrar(entrada: EntradaLogin): Promise<ResultadoLogin> {
  const validado = esquemaLogin.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, erro: primeiraMensagem(validado.error) };
  }

  const identificador = resolverIdentificador(
    validado.data.identificador,
    slugOrganizacao(),
  );
  if (!identificador) {
    return { ok: false, erro: ERRO_IDENTIFICADOR };
  }

  const mascarado = mascararIdentificador(validado.data.identificador);
  const chave = chaveDoLogin(identificador.email);
  const cadastro = await usuarioPorEmailLogin(identificador.email);
  // Sem cadastro, o evento ainda precisa de organização para aparecer na
  // trilha (ver `idDaOrganizacao`).
  const orgId = cadastro?.org_id ?? (await idDaOrganizacao());

  // Antes da senha: durante o bloqueio ela não é testada. Vale igual para
  // identificador sem cadastro — senão a sexta tentativa revelaria quem existe.
  const situacao = await situacaoDoLogin(chave);
  if (situacao.bloqueado) {
    await registrarAuditoria({
      acao: "login_bloqueado",
      entidade: "usuarios",
      entidadeId: cadastro?.id ?? null,
      usuarioId: cadastro?.id ?? null,
      orgId,
      detalhes: {
        identificador: mascarado,
        chave_login: chave,
        bloqueado_ate: situacao.ate.toISOString(),
      },
    });
    return {
      ok: false,
      erro: mensagemDeBloqueio(situacao.ate, new Date()),
      bloqueadoAte: situacao.ate.toISOString(),
    };
  }

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: identificador.email,
    password: validado.data.senha,
  });

  if (error || !data.user) {
    await registrarAuditoria({
      acao: "falha_login",
      entidade: "usuarios",
      entidadeId: cadastro?.id ?? null,
      usuarioId: cadastro?.id ?? null,
      orgId,
      detalhes: { identificador: mascarado, chave_login: chave, motivo: "credencial_invalida" },
    });
    return { ok: false, erro: ERRO_CREDENCIAL };
  }

  // Conta existe no Auth mas não é usuário do Portal, ou foi desativada.
  if (!cadastro || cadastro.status !== "ativo") {
    await supabase.auth.signOut();
    await registrarAuditoria({
      acao: "falha_login",
      entidade: "usuarios",
      entidadeId: cadastro?.id ?? null,
      usuarioId: cadastro?.id ?? null,
      orgId,
      // Sem `chave_login`: a senha estava certa, então isto não é palpite, e
      // não deve empurrar o identificador para o bloqueio.
      detalhes: { identificador: mascarado, motivo: "acesso_inativo" },
    });
    return {
      ok: false,
      erro: "Seu acesso está inativo. Fale com o RH da 3e para reativar.",
    };
  }

  // `usuarios` só aceita update de quem administra: quem marca o acesso é o
  // servidor, não o próprio usuário.
  const admin = criarClienteAdmin();
  const { data: atualizado } = await admin
    .from("usuarios")
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq("id", cadastro.id)
    .select("precisa_trocar_senha, tipo")
    .maybeSingle();

  await registrarAuditoria({
    acao: "login",
    entidade: "usuarios",
    entidadeId: cadastro.id,
    usuarioId: cadastro.id,
    orgId: cadastro.org_id,
    // `chave_login` zera a contagem de falhas deste identificador.
    detalhes: { tipo: cadastro.tipo, via: identificador.tipo, chave_login: chave },
  });

  if (atualizado?.precisa_trocar_senha ?? false) redirect("/primeiro-acesso");

  // `destino` é o que o proxy guardou ao barrar o acesso sem sessão. Só volta
  // para lá se for rota da área deste tipo — senão, rota inicial.
  redirect(
    destinoPermitido(validado.data.destino, cadastro.tipo) ?? rotaInicial(cadastro.tipo),
  );
}

// ---------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------

export async function sair(): Promise<void> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await registrarAuditoria({
      acao: "logout",
      entidade: "usuarios",
      entidadeId: user.id,
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------
// Primeiro acesso / troca de senha
// ---------------------------------------------------------------------

export async function trocarSenha(entrada: EntradaTrocaDeSenha): Promise<Resultado> {
  const validado = esquemaTrocaDeSenha.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, erro: primeiraMensagem(validado.error) };
  }

  const usuario = await exigirUsuario();

  try {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.updateUser({ password: validado.data.senha });
    if (error) {
      // O Auth recusa senha igual à atual e senha em lista de vazamento.
      return {
        ok: false,
        erro: "Não foi possível salvar a nova senha. Escolha uma senha diferente da atual, com pelo menos 8 caracteres.",
      };
    }

    const admin = criarClienteAdmin();
    await admin
      .from("usuarios")
      .update({ precisa_trocar_senha: false })
      .eq("id", usuario.id);

    await registrarAuditoria({
      acao: "trocar_senha",
      entidade: "usuarios",
      entidadeId: usuario.id,
      detalhes: { origem: "primeiro_acesso" },
    });
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }

  redirect(rotaInicial(usuario.tipo));
}

// ---------------------------------------------------------------------
// Recuperação de senha
// ---------------------------------------------------------------------

/** E-mail de verdade da pessoa. O sintético do funcionário não recebe nada. */
async function emailDeContato(cadastro: {
  id: string;
  tipo: string;
  pessoa_id: string | null;
  email_login: string;
}): Promise<string | null> {
  if (cadastro.tipo !== "funcionario") return cadastro.email_login;
  if (!cadastro.pessoa_id) return null;

  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("pessoas")
    .select("email_pessoal")
    .eq("id", cadastro.pessoa_id)
    .maybeSingle();

  return data?.email_pessoal ?? null;
}

export async function pedirCodigo(
  entrada: EntradaPedidoDeCodigo,
): Promise<Resultado> {
  const validado = esquemaPedidoDeCodigo.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, erro: primeiraMensagem(validado.error) };
  }

  const identificador = resolverIdentificador(
    validado.data.identificador,
    slugOrganizacao(),
  );
  if (!identificador) {
    return { ok: false, erro: ERRO_IDENTIFICADOR };
  }

  const cadastro = await usuarioPorEmailLogin(identificador.email);

  // Resposta idêntica com ou sem cadastro: nada aqui revela quem existe.
  if (!cadastro || cadastro.status !== "ativo") {
    return { ok: true };
  }

  try {
    const destino = await emailDeContato(cadastro);
    if (!destino) {
      console.warn(
        "[recuperacao] usuário sem e-mail de contato cadastrado:",
        cadastro.id,
      );
      return { ok: true };
    }

    const codigo = await gerarCodigo(cadastro.id, "recuperacao_senha");

    // Auditado no pedido, não no envio: código gerado tem de deixar rastro
    // mesmo quando a entrega falha.
    await registrarAuditoria({
      acao: "codigo_solicitado",
      entidade: "codigos_verificacao",
      usuarioId: cadastro.id,
      orgId: cadastro.org_id,
      detalhes: { finalidade: "recuperacao_senha" },
    });

    await enviarEmail({
      para: destino,
      assunto: "Código para redefinir sua senha do Portal 3e",
      texto: [
        `Olá, ${cadastro.nome.split(" ")[0]}.`,
        "",
        `Seu código para redefinir a senha do Portal 3e é ${codigo}.`,
        `Ele vale por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.`,
        "",
        "Se não foi você que pediu, ignore esta mensagem e sua senha continua a mesma.",
      ].join("\n"),
    });

    // O corpo guardado não contém o código — o log não pode virar cópia dele.
    const admin = criarClienteAdmin();
    await admin.from("notificacoes").insert({
      org_id: cadastro.org_id,
      usuario_id: cadastro.id,
      canal: "email",
      assunto: "Código para redefinir sua senha do Portal 3e",
      corpo: "Código de uso único enviado por e-mail.",
      referencia_tipo: "recuperacao_senha",
      status: "enviada",
      enviada_em: new Date().toISOString(),
    });

  } catch (erro) {
    // Falha de envio não pode virar pista de que o cadastro existe.
    console.error("[recuperacao] falha ao enviar código", erro);
  }

  return { ok: true };
}

export async function redefinirSenha(
  entrada: EntradaRedefinicao,
): Promise<Resultado> {
  const validado = esquemaRedefinicao.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, erro: primeiraMensagem(validado.error) };
  }

  const identificador = resolverIdentificador(
    validado.data.identificador,
    slugOrganizacao(),
  );
  if (!identificador) {
    return { ok: false, erro: ERRO_IDENTIFICADOR };
  }

  const cadastro = await usuarioPorEmailLogin(identificador.email);
  if (!cadastro || cadastro.status !== "ativo") {
    // Mesma mensagem de código inválido: sem pista sobre o cadastro.
    return { ok: false, erro: "Código expirado ou já utilizado. Peça um novo código." };
  }

  try {
    const conferencia = await validarCodigo(
      cadastro.id,
      "recuperacao_senha",
      validado.data.codigo,
    );
    if (!conferencia.ok) {
      await registrarAuditoria({
        acao: "falha_codigo",
        entidade: "codigos_verificacao",
        usuarioId: cadastro.id,
        orgId: cadastro.org_id,
        detalhes: { finalidade: "recuperacao_senha" },
      });
      return { ok: false, erro: conferencia.erro };
    }

    const admin = criarClienteAdmin();
    const { error } = await admin.auth.admin.updateUserById(cadastro.id, {
      password: validado.data.senha,
    });
    if (error) {
      return {
        ok: false,
        erro: "Não foi possível salvar a nova senha. Escolha outra senha com pelo menos 8 caracteres.",
      };
    }

    await admin
      .from("usuarios")
      .update({ precisa_trocar_senha: false })
      .eq("id", cadastro.id);

    await registrarAuditoria({
      acao: "senha_redefinida",
      entidade: "usuarios",
      entidadeId: cadastro.id,
      usuarioId: cadastro.id,
      orgId: cadastro.org_id,
      // Quem provou ser dono da conta pelo código não herda o bloqueio.
      detalhes: { origem: "recuperacao", chave_login: chaveDoLogin(identificador.email) },
    });
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }

  redirect("/login?senha=redefinida");
}
