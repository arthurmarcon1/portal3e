"use server";

import { revalidatePath } from "next/cache";

import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/sessao";
import { mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/server";

import {
  esquemaContratante,
  esquemaContratanteEdicao,
  esquemaContrato,
  esquemaContratoEdicao,
  esquemaMudancaDeStatus,
  esquemaUnidade,
  esquemaUnidadeEdicao,
  primeiraMensagem,
} from "./schemas";

/**
 * Mutações da estrutura comercial.
 *
 * Toda ação segue a mesma ordem (CLAUDE.md): Zod → exigirPermissao →
 * operação com o client do usuário (RLS ainda vale) → registrarAuditoria →
 * revalidatePath. Erro sai como `{ ok: false, erro }` em português.
 */

const ROTAS = ["/admin/contratantes", "/admin/contratos", "/admin/unidades"];

/** Uma mudança aqui mexe nas três listas: contrato mostra unidade e vice-versa. */
function revalidarComercial() {
  for (const rota of ROTAS) revalidatePath(rota);
}

/**
 * Traduz erro do Postgres em mensagem de usuário.
 *
 * Só os casos que a tela pode causar. O resto cai no genérico de
 * `mensagemDeErro`, e o detalhe fica no log do servidor.
 */
function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
  if (codigo === "23505") {
    if (mensagem.includes("cnpj")) return "Já existe um contratante com esse CNPJ.";
    if (mensagem.includes("numero")) return "Já existe um contrato com esse número.";
    return "Já existe um registro com esses dados.";
  }
  if (codigo === "23503") {
    return "Este registro está em uso e não pode ser removido. Desative-o em vez de excluir.";
  }
  if (codigo === "42501") {
    return "Você não tem permissão para esta alteração. Fale com o administrador do Portal.";
  }
  console.error("[contratos] erro de banco não traduzido", codigo, mensagem);
  return "Não foi possível salvar. Tente novamente em alguns minutos ou abra um chamado com o suporte.";
}

// =====================================================================
// Contratantes
// =====================================================================

export async function criarContratante(entrada: unknown): Promise<Resultado> {
  const validado = esquemaContratante.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  try {
    const usuario = await exigirPermissao("contratos", "criar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("contratantes")
      .insert({ ...validado.data, org_id: usuario.orgId })
      .select("id")
      .single();

    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "criar",
      entidade: "contratantes",
      entidadeId: data.id,
      detalhes: { nome: validado.data.nome },
    });

    revalidarComercial();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function editarContratante(entrada: unknown): Promise<Resultado> {
  const validado = esquemaContratanteEdicao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { id, ...campos } = validado.data;

  try {
    await exigirPermissao("contratos", "editar");
    const supabase = await criarClienteServidor();

    const { error } = await supabase.from("contratantes").update(campos).eq("id", id);
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "editar",
      entidade: "contratantes",
      entidadeId: id,
      detalhes: { nome: campos.nome },
    });

    revalidarComercial();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function mudarStatusContratante(entrada: unknown): Promise<Resultado> {
  return mudarStatus("contratantes", entrada);
}

// =====================================================================
// Contratos
// =====================================================================

/**
 * Reescreve o vínculo `contrato_unidades` do contrato.
 *
 * Apaga o que saiu e insere o que entrou, em vez de apagar tudo e regravar:
 * assim o vínculo que não mudou não desaparece nem por um instante.
 */
async function sincronizarUnidades(
  contratoId: string,
  desejadas: string[],
): Promise<string | null> {
  const supabase = await criarClienteServidor();

  const { data: atuais, error: erroLeitura } = await supabase
    .from("contrato_unidades")
    .select("unidade_id")
    .eq("contrato_id", contratoId);

  if (erroLeitura) return traduzirErroDeBanco(erroLeitura.code, erroLeitura.message);

  const antes = new Set((atuais ?? []).map((v) => v.unidade_id));
  const depois = new Set(desejadas);

  const remover = [...antes].filter((id) => !depois.has(id));
  const incluir = [...depois].filter((id) => !antes.has(id));

  if (remover.length) {
    const { error } = await supabase
      .from("contrato_unidades")
      .delete()
      .eq("contrato_id", contratoId)
      .in("unidade_id", remover);
    if (error) return traduzirErroDeBanco(error.code, error.message);
  }

  if (incluir.length) {
    const { error } = await supabase
      .from("contrato_unidades")
      .insert(incluir.map((unidade_id) => ({ contrato_id: contratoId, unidade_id })));
    if (error) return traduzirErroDeBanco(error.code, error.message);
  }

  return null;
}

export async function criarContrato(entrada: unknown): Promise<Resultado> {
  const validado = esquemaContrato.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { unidades, ...campos } = validado.data;

  try {
    const usuario = await exigirPermissao("contratos", "criar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("contratos")
      .insert({ ...campos, org_id: usuario.orgId })
      .select("id")
      .single();

    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    const erroVinculo = await sincronizarUnidades(data.id, unidades);
    if (erroVinculo) {
      // O contrato ficou criado sem as unidades. Melhor dizer isso do que
      // fingir sucesso: a tela de edição resolve em um clique.
      return {
        ok: false,
        erro: `Contrato criado, mas não foi possível vincular as unidades: ${erroVinculo}`,
      };
    }

    await registrarAuditoria({
      acao: "criar",
      entidade: "contratos",
      entidadeId: data.id,
      detalhes: { numero: campos.numero, unidades: unidades.length },
    });

    revalidarComercial();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function editarContrato(entrada: unknown): Promise<Resultado> {
  const validado = esquemaContratoEdicao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { id, unidades, ...campos } = validado.data;

  try {
    await exigirPermissao("contratos", "editar");
    const supabase = await criarClienteServidor();

    const { error } = await supabase.from("contratos").update(campos).eq("id", id);
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    const erroVinculo = await sincronizarUnidades(id, unidades);
    if (erroVinculo) return { ok: false, erro: erroVinculo };

    await registrarAuditoria({
      acao: "editar",
      entidade: "contratos",
      entidadeId: id,
      detalhes: { numero: campos.numero, unidades: unidades.length },
    });

    revalidarComercial();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function mudarStatusContrato(entrada: unknown): Promise<Resultado> {
  return mudarStatus("contratos", entrada);
}

// =====================================================================
// Unidades
// =====================================================================

export async function criarUnidade(entrada: unknown): Promise<Resultado> {
  const validado = esquemaUnidade.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  try {
    const usuario = await exigirPermissao("contratos", "criar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("unidades")
      .insert({ ...validado.data, org_id: usuario.orgId })
      .select("id")
      .single();

    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "criar",
      entidade: "unidades",
      entidadeId: data.id,
      detalhes: { nome: validado.data.nome },
    });

    revalidarComercial();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function editarUnidade(entrada: unknown): Promise<Resultado> {
  const validado = esquemaUnidadeEdicao.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { id, ...campos } = validado.data;

  try {
    await exigirPermissao("contratos", "editar");
    const supabase = await criarClienteServidor();

    const { error } = await supabase.from("unidades").update(campos).eq("id", id);
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "editar",
      entidade: "unidades",
      entidadeId: id,
      detalhes: { nome: campos.nome },
    });

    revalidarComercial();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function mudarStatusUnidade(entrada: unknown): Promise<Resultado> {
  return mudarStatus("unidades", entrada);
}

// =====================================================================
// Desativação — compartilhada pelas três entidades
// =====================================================================

/**
 * Troca o `status` da entidade. Nunca apaga (CLAUDE.md, invariante 8).
 *
 * Desativar exige `contratos:editar`, não `contratos:excluir`: a linha
 * continua no banco e o histórico segue íntegro. `excluir` fica reservado
 * para remoção de verdade, que o Portal não oferece nestas telas.
 */
async function mudarStatus(
  tabela: "contratantes" | "contratos" | "unidades",
  entrada: unknown,
): Promise<Resultado> {
  const validado = esquemaMudancaDeStatus.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  const { id, status } = validado.data;

  try {
    await exigirPermissao("contratos", "editar");
    const supabase = await criarClienteServidor();

    const { error } = await supabase.from(tabela).update({ status }).eq("id", id);
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: status === "ativo" ? "reativar" : "desativar",
      entidade: tabela,
      entidadeId: id,
      detalhes: { status },
    });

    revalidarComercial();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
