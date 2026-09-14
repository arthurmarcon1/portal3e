"use server";

import { revalidatePath } from "next/cache";

import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/sessao";
import { ErroDeNegocio, mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/server";

import {
  esquemaAlocacao,
  esquemaEncerramento,
  esquemaMudancaDeStatusPessoa,
  esquemaPessoa,
  esquemaPessoaEdicao,
  primeiraMensagem,
} from "./schemas";

/**
 * Mutações de pessoas e alocações.
 *
 * Toda ação segue a mesma ordem (CLAUDE.md): Zod → exigirPermissao →
 * operação com o client do usuário (RLS ainda vale) → registrarAuditoria →
 * revalidatePath. Erro sai como `{ ok: false, erro }` em português.
 */

function revalidarPessoas(pessoaId?: string) {
  revalidatePath("/admin/pessoas");
  if (pessoaId) revalidatePath(`/admin/pessoas/${pessoaId}`);
}

/**
 * Traduz erro do Postgres em mensagem de usuário.
 *
 * Só os casos que a tela pode causar. O resto cai no genérico, e o detalhe
 * fica no log do servidor — nunca na tela (CLAUDE.md).
 */
function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
  if (codigo === "23505") {
    if (mensagem.includes("cpf")) {
      return "Já existe uma pessoa cadastrada com esse CPF.";
    }
    return "Já existe um registro com esses dados.";
  }
  if (codigo === "23503") {
    return "Este registro está em uso e não pode ser removido. Desative-o em vez de excluir.";
  }
  if (codigo === "42501") {
    return "Você não tem permissão para esta alteração. Fale com o administrador do Portal.";
  }
  console.error("[pessoas] erro de banco não traduzido", codigo, mensagem);
  return "Não foi possível salvar. Tente novamente em alguns minutos ou abra um chamado com o suporte.";
}

/**
 * CPF só nos detalhes da auditoria quando é o próprio identificador do
 * evento; nas demais gravações vai o nome. `auditoria` é lida por perfil de
 * suporte, e log não é lugar de espalhar dado pessoal (docs/02).
 */
function resumoDaPessoa(nome: string) {
  return { nome };
}

// =====================================================================
// Pessoa
// =====================================================================

export async function criarPessoa(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const validado = esquemaPessoa.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  try {
    const usuario = await exigirPermissao("pessoas", "criar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("pessoas")
      .insert({ ...validado.data, org_id: usuario.orgId })
      .select("id")
      .single();

    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "criar",
      entidade: "pessoas",
      entidadeId: data.id,
      detalhes: resumoDaPessoa(validado.data.nome),
    });

    revalidarPessoas(data.id);
    return { ok: true, dados: { id: data.id } };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function editarPessoa(entrada: unknown): Promise<Resultado> {
  const validado = esquemaPessoaEdicao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { id, ...campos } = validado.data;

  try {
    await exigirPermissao("pessoas", "editar");
    const supabase = await criarClienteServidor();

    const { error } = await supabase.from("pessoas").update(campos).eq("id", id);
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "editar",
      entidade: "pessoas",
      entidadeId: id,
      detalhes: resumoDaPessoa(campos.nome),
    });

    revalidarPessoas(id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/**
 * Troca o `status` da pessoa. Nunca apaga (CLAUDE.md, invariante 8).
 *
 * Como na estrutura comercial, desativar exige `pessoas:editar` e não
 * `pessoas:excluir`: a linha continua no banco, com o histórico inteiro.
 */
export async function mudarStatusPessoa(entrada: unknown): Promise<Resultado> {
  const validado = esquemaMudancaDeStatusPessoa.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { id, status } = validado.data;

  try {
    await exigirPermissao("pessoas", "editar");
    const supabase = await criarClienteServidor();

    const { error } = await supabase.from("pessoas").update({ status }).eq("id", id);
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: status === "ativo" ? "reativar" : "desativar",
      entidade: "pessoas",
      entidadeId: id,
      detalhes: { status },
    });

    revalidarPessoas(id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Alocação
// =====================================================================

/**
 * Cria a alocação: contrato + unidade + função + data de início.
 *
 * Antes de gravar, confere que a unidade é atendida pelo contrato. O banco
 * não tem essa amarração (são duas FKs independentes), e sem a checagem uma
 * alocação incoerente entraria e distorceria o escopo do contratante — que é
 * calculado justamente por contrato × unidade (docs/03).
 */
export async function criarAlocacao(entrada: unknown): Promise<Resultado> {
  const validado = esquemaAlocacao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const dados = validado.data;

  try {
    const usuario = await exigirPermissao("pessoas", "criar");
    const supabase = await criarClienteServidor();

    const { data: vinculo, error: erroVinculo } = await supabase
      .from("contrato_unidades")
      .select("contrato_id")
      .eq("contrato_id", dados.contrato_id)
      .eq("unidade_id", dados.unidade_id)
      .maybeSingle();

    if (erroVinculo) {
      return { ok: false, erro: traduzirErroDeBanco(erroVinculo.code, erroVinculo.message) };
    }
    if (!vinculo) {
      throw new ErroDeNegocio(
        "Esta unidade não está vinculada ao contrato escolhido. Vincule-a em Contratos ou escolha outra unidade.",
      );
    }

    const { data, error } = await supabase
      .from("alocacoes")
      .insert({ ...dados, org_id: usuario.orgId })
      .select("id")
      .single();

    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "criar",
      entidade: "alocacoes",
      entidadeId: data.id,
      detalhes: {
        pessoa_id: dados.pessoa_id,
        contrato_id: dados.contrato_id,
        unidade_id: dados.unidade_id,
        funcao: dados.funcao,
        data_inicio: dados.data_inicio,
      },
    });

    revalidarPessoas(dados.pessoa_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/**
 * Encerra a alocação: `status = 'encerrada'` com `data_fim`.
 *
 * Não apaga a linha — o histórico da pessoa é o que sustenta o espelho, a
 * ciência e o que o contratante enxergou em cada período (invariante 8).
 */
export async function encerrarAlocacao(entrada: unknown): Promise<Resultado> {
  const validado = esquemaEncerramento.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { id, data_fim } = validado.data;

  try {
    await exigirPermissao("pessoas", "editar");
    const supabase = await criarClienteServidor();

    const { data: atual, error: erroLeitura } = await supabase
      .from("alocacoes")
      .select("id, pessoa_id, status, data_inicio")
      .eq("id", id)
      .maybeSingle();

    if (erroLeitura) {
      return { ok: false, erro: traduzirErroDeBanco(erroLeitura.code, erroLeitura.message) };
    }
    if (!atual) {
      throw new ErroDeNegocio("Alocação não encontrada. Atualize a página e tente de novo.");
    }
    if (atual.status === "encerrada") {
      throw new ErroDeNegocio("Esta alocação já está encerrada.");
    }
    if (data_fim < atual.data_inicio) {
      throw new ErroDeNegocio("A data de fim não pode ser antes da data de início.");
    }

    const { error } = await supabase
      .from("alocacoes")
      .update({ status: "encerrada", data_fim })
      .eq("id", id);

    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "encerrar",
      entidade: "alocacoes",
      entidadeId: id,
      detalhes: { pessoa_id: atual.pessoa_id, data_fim },
    });

    revalidarPessoas(atual.pessoa_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
