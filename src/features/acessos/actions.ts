"use server";

import { revalidatePath } from "next/cache";

import { registrarAuditoria } from "@/lib/audit";
import { emailSintetico } from "@/lib/auth/identificador";
import { slugOrganizacao } from "@/lib/auth/organizacao";
import { exigirPermissao } from "@/lib/auth/sessao";
import { ErroDeNegocio, mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { gerarSenhaProvisoria } from "./senha";
import {
  esquemaEscoposDoUsuario,
  esquemaNovoUsuario,
  esquemaPerfisDoUsuario,
  esquemaPermissoesDoPerfil,
  esquemaSituacaoDoUsuario,
  primeiraMensagem,
} from "./schemas";

/**
 * Mutações da administração de acesso (F2.1).
 *
 * Ordem de sempre: Zod → exigirPermissao → operação → registrarAuditoria →
 * revalidatePath.
 *
 * **Toda mudança de perfil, escopo ou permissão grava o estado ANTERIOR e o
 * NOVO em `detalhes`.** Sem o "antes", a trilha responde "o que ele tem hoje",
 * que é a pergunta que o banco já responde; com ele, responde "o que mudou e
 * a partir de quando" — que é a única que interessa numa apuração.
 */

const ROTAS = ["/admin/acessos", "/admin/acessos/perfis"];
function revalidarAcessos() {
  for (const rota of ROTAS) revalidatePath(rota);
}

function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
  if (codigo === "23505") {
    if (mensagem.includes("email_login")) {
      return "Já existe um usuário com esse e-mail de acesso.";
    }
    return "Já existe um registro com esses dados.";
  }
  if (codigo === "23503") {
    return "Registro relacionado não encontrado. Atualize a página e tente de novo.";
  }
  if (codigo === "42501") {
    return "Você não tem permissão para esta alteração. Fale com o administrador do Portal.";
  }
  console.error("[acessos] erro de banco não traduzido", codigo, mensagem);
  return "Não foi possível salvar. Tente novamente em alguns minutos ou abra um chamado com o suporte.";
}

// =====================================================================
// Criação de usuário
// =====================================================================

export type UsuarioCriado = {
  nome: string;
  emailLogin: string;
  /**
   * Mostrada UMA vez na tela de quem criou e nunca mais. Não é gravada em
   * lugar nenhum, não entra em `auditoria` e não vai para log.
   */
  senhaProvisoria: string;
};

/**
 * Cria o usuário no Auth e a linha correspondente em `usuarios`.
 *
 * **Por que `service_role` aqui** (invariante 2 pede a justificativa): criar
 * identidade no `auth.users` é operação de sistema — não existe policy que
 * permita a um usuário autenticado criar outro. A chave fica confinada a esta
 * action; a permissão é conferida antes, e a linha de domínio em `usuarios` é
 * gravada com o **client do usuário**, para a RLS continuar sendo quem
 * autoriza o que é de domínio.
 *
 * As duas escritas não cabem numa transação (Auth e Postgres são serviços
 * distintos). Se a segunda falhar, a primeira é desfeita à mão — sem isso
 * sobraria uma identidade órfã no Auth, capaz de autenticar e sem linha em
 * `usuarios`, que é o estado que `getUsuario()` trata como não autenticado.
 */
export async function criarUsuario(entrada: unknown): Promise<Resultado<UsuarioCriado>> {
  const validado = esquemaNovoUsuario.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const dados = validado.data;

  try {
    const autor = await exigirPermissao("administracao", "criar");
    const supabase = await criarClienteServidor();
    const admin = criarClienteAdmin();

    // ----------------------------------------------------------------
    // Quem é, e por qual e-mail entra
    // ----------------------------------------------------------------
    let nome: string;
    let emailLogin: string;
    let pessoaId: string | null = null;
    let telefone: string | null = null;

    if (dados.tipo === "funcionario") {
      const { data: pessoa, error } = await supabase
        .from("pessoas")
        .select("id, nome, cpf, telefone")
        .eq("id", dados.pessoa_id)
        .maybeSingle();

      if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
      if (!pessoa) {
        throw new ErroDeNegocio("Pessoa não encontrada. Atualize a página e tente de novo.");
      }

      pessoaId = pessoa.id;
      nome = pessoa.nome;
      telefone = pessoa.telefone;
      // docs/03: <cpf>@func.<slug>.portal3e — domínio interno, não resolve DNS.
      emailLogin = emailSintetico(pessoa.cpf, slugOrganizacao());
    } else {
      nome = dados.nome;
      emailLogin = dados.email;
      telefone = dados.telefone;
    }

    const senhaProvisoria = gerarSenhaProvisoria();

    // ----------------------------------------------------------------
    // Identidade no Auth
    // ----------------------------------------------------------------
    const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
      email: emailLogin,
      password: senhaProvisoria,
      // O domínio sintético do funcionário não recebe e-mail; pedir
      // confirmação deixaria todo funcionário trancado para fora.
      email_confirm: true,
    });

    if (erroAuth || !criado.user) {
      const jaExiste = erroAuth?.message?.toLowerCase().includes("already");
      return {
        ok: false,
        erro: jaExiste
          ? "Já existe um acesso com esse e-mail. Procure o usuário na lista em vez de criar outro."
          : "Não foi possível criar o acesso. Tente novamente em alguns minutos.",
      };
    }

    // ----------------------------------------------------------------
    // Linha de domínio — pelo client do usuário, sob RLS
    // ----------------------------------------------------------------
    const { error: erroUsuario } = await supabase.from("usuarios").insert({
      id: criado.user.id,
      org_id: autor.orgId,
      pessoa_id: pessoaId,
      tipo: dados.tipo,
      nome,
      email_login: emailLogin,
      telefone,
      precisa_trocar_senha: true,
    });

    if (erroUsuario) {
      // Desfaz a identidade órfã. Se até isso falhar, o aviso no log é o que
      // resta para alguém limpar à mão.
      const { error: erroLimpeza } = await admin.auth.admin.deleteUser(criado.user.id);
      if (erroLimpeza) {
        console.error(
          `[acessos] IDENTIDADE ÓRFÃ no Auth: id=${criado.user.id} email=${emailLogin}. ` +
            `A linha em usuarios falhou (${erroUsuario.message}) e a limpeza também ` +
            `(${erroLimpeza.message}). Remova à mão.`,
        );
      }
      return { ok: false, erro: traduzirErroDeBanco(erroUsuario.code, erroUsuario.message) };
    }

    // ----------------------------------------------------------------
    // Perfis e escopo (funcionário não tem nem um nem outro — docs/02)
    // ----------------------------------------------------------------
    if (dados.tipo !== "funcionario") {
      const erroVinculos = await gravarPerfis(criado.user.id, dados.perfis);
      if (erroVinculos) return { ok: false, erro: erroVinculos };

      const erroEscopo = await gravarEscopo(criado.user.id, dados.escopo);
      if (erroEscopo) return { ok: false, erro: erroEscopo };
    }

    await registrarAuditoria({
      acao: "criar_usuario",
      entidade: "usuarios",
      entidadeId: criado.user.id,
      detalhes: {
        nome,
        tipo: dados.tipo,
        email_login: emailLogin,
        pessoa_id: pessoaId,
        perfis: dados.tipo === "funcionario" ? [] : dados.perfis,
        escopo: dados.tipo === "funcionario" ? null : dados.escopo,
        // A senha provisória NÃO entra aqui. `auditoria` é lida pelo perfil de
        // suporte; trilha não é lugar de credencial.
      },
    });

    revalidarAcessos();
    return { ok: true, dados: { nome, emailLogin, senhaProvisoria } };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Perfis e escopo de um usuário existente
// =====================================================================

async function gravarPerfis(usuarioId: string, perfis: string[]): Promise<string | null> {
  const supabase = await criarClienteServidor();

  const { error: erroApaga } = await supabase
    .from("usuario_perfis")
    .delete()
    .eq("usuario_id", usuarioId);
  if (erroApaga) return traduzirErroDeBanco(erroApaga.code, erroApaga.message);

  if (perfis.length === 0) return null;

  const { error } = await supabase
    .from("usuario_perfis")
    .insert(perfis.map((perfil_id) => ({ usuario_id: usuarioId, perfil_id })));
  return error ? traduzirErroDeBanco(error.code, error.message) : null;
}

async function gravarEscopo(
  usuarioId: string,
  escopo: { contratos: string[]; unidades: string[] },
): Promise<string | null> {
  const supabase = await criarClienteServidor();

  const { error: erroApaga } = await supabase
    .from("usuario_escopos")
    .delete()
    .eq("usuario_id", usuarioId);
  if (erroApaga) return traduzirErroDeBanco(erroApaga.code, erroApaga.message);

  const linhas = [
    ...escopo.contratos.map((contrato_id) => ({
      usuario_id: usuarioId,
      contrato_id,
      unidade_id: null,
    })),
    ...escopo.unidades.map((unidade_id) => ({
      usuario_id: usuarioId,
      contrato_id: null,
      unidade_id,
    })),
  ];

  if (linhas.length === 0) return null;

  const { error } = await supabase.from("usuario_escopos").insert(linhas);
  return error ? traduzirErroDeBanco(error.code, error.message) : null;
}

/** Perfis e escopo como estão agora, para o "antes" da auditoria. */
async function estadoDeAcesso(usuarioId: string) {
  const supabase = await criarClienteServidor();

  const [perfis, escopos] = await Promise.all([
    supabase.from("usuario_perfis").select("perfil_id").eq("usuario_id", usuarioId),
    supabase
      .from("usuario_escopos")
      .select("contrato_id, unidade_id")
      .eq("usuario_id", usuarioId),
  ]);

  return {
    perfis: (perfis.data ?? []).map((p) => p.perfil_id).sort(),
    escopo: {
      contratos: (escopos.data ?? [])
        .flatMap((e) => (e.contrato_id ? [e.contrato_id] : []))
        .sort(),
      unidades: (escopos.data ?? [])
        .flatMap((e) => (e.unidade_id ? [e.unidade_id] : []))
        .sort(),
    },
  };
}

export async function alterarPerfisDoUsuario(entrada: unknown): Promise<Resultado> {
  const validado = esquemaPerfisDoUsuario.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { usuario_id, perfis } = validado.data;

  try {
    await exigirPermissao("administracao", "editar");

    const antes = await estadoDeAcesso(usuario_id);
    const erro = await gravarPerfis(usuario_id, perfis);
    if (erro) return { ok: false, erro };

    await registrarAuditoria({
      acao: "mudar_perfis",
      entidade: "usuarios",
      entidadeId: usuario_id,
      detalhes: { antes: antes.perfis, depois: [...perfis].sort() },
    });

    revalidarAcessos();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function alterarEscopoDoUsuario(entrada: unknown): Promise<Resultado> {
  const validado = esquemaEscoposDoUsuario.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { usuario_id, escopo } = validado.data;

  try {
    await exigirPermissao("administracao", "editar");

    const antes = await estadoDeAcesso(usuario_id);
    const erro = await gravarEscopo(usuario_id, escopo);
    if (erro) return { ok: false, erro };

    await registrarAuditoria({
      acao: "mudar_escopo",
      entidade: "usuarios",
      entidadeId: usuario_id,
      detalhes: {
        antes: antes.escopo,
        depois: {
          contratos: [...escopo.contratos].sort(),
          unidades: [...escopo.unidades].sort(),
        },
      },
    });

    revalidarAcessos();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/**
 * Desativa ou reativa. **Nunca exclui** (F2.1 e invariante 8): a identidade
 * responde por ciências, downloads e linhas de auditoria que não podem ficar
 * órfãs. Usuário inativo é recusado já em `getUsuario()`, que trata status
 * diferente de `ativo` como sessão inexistente.
 */
export async function alterarSituacaoDoUsuario(entrada: unknown): Promise<Resultado> {
  const validado = esquemaSituacaoDoUsuario.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { usuario_id, status } = validado.data;

  try {
    const autor = await exigirPermissao("administracao", "editar");

    if (usuario_id === autor.id && status === "inativo") {
      throw new ErroDeNegocio(
        "Você não pode desativar o próprio acesso. Peça a outro administrador.",
      );
    }

    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .from("usuarios")
      .update({ status })
      .eq("id", usuario_id);

    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: status === "ativo" ? "reativar_usuario" : "desativar_usuario",
      entidade: "usuarios",
      entidadeId: usuario_id,
      detalhes: { antes: status === "ativo" ? "inativo" : "ativo", depois: status },
    });

    revalidarAcessos();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Matriz de permissões do perfil
// =====================================================================

/**
 * Reescreve a matriz `modulo × acao` de um perfil.
 *
 * Isto é o que docs/03 chama de "permissão é dado": mudar o que o fiscal pode
 * fazer é um insert, não um deploy. Por isso mesmo é a mudança mais sensível
 * da tela — o antes e o depois na auditoria não são enfeite.
 */
export async function alterarPermissoesDoPerfil(entrada: unknown): Promise<Resultado> {
  const validado = esquemaPermissoesDoPerfil.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { perfil_id, permissoes } = validado.data;

  try {
    await exigirPermissao("administracao", "editar");
    const supabase = await criarClienteServidor();

    const { data: atuais, error: erroLeitura } = await supabase
      .from("perfil_permissoes")
      .select("modulo, acao")
      .eq("perfil_id", perfil_id);

    if (erroLeitura) {
      return { ok: false, erro: traduzirErroDeBanco(erroLeitura.code, erroLeitura.message) };
    }

    const antes = (atuais ?? []).map((p) => `${p.modulo}:${p.acao}`).sort();
    const depois = [...new Set(permissoes)].sort();

    if (antes.join("|") === depois.join("|")) return { ok: true };

    const { error: erroApaga } = await supabase
      .from("perfil_permissoes")
      .delete()
      .eq("perfil_id", perfil_id);
    if (erroApaga) {
      return { ok: false, erro: traduzirErroDeBanco(erroApaga.code, erroApaga.message) };
    }

    if (depois.length > 0) {
      const { error } = await supabase.from("perfil_permissoes").insert(
        depois.map((p) => {
          const [modulo, acao] = p.split(":");
          return { perfil_id, modulo, acao };
        }),
      );
      if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    }

    await registrarAuditoria({
      acao: "mudar_permissoes_perfil",
      entidade: "perfis",
      entidadeId: perfil_id,
      detalhes: {
        antes,
        depois,
        // O diff explícito poupa quem for ler a trilha de comparar duas listas
        // de trinta itens para achar a linha que mudou.
        concedidas: depois.filter((p) => !antes.includes(p)),
        revogadas: antes.filter((p) => !depois.includes(p)),
      },
    });

    revalidarAcessos();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
