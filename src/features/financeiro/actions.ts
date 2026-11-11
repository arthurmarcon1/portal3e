"use server";

import { revalidatePath } from "next/cache";

import { ErroDeAnexo, validarAnexo } from "@/features/documentos/anexo";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/sessao";
import { mensagemDeErro, type Resultado } from "@/lib/erros";
import { ErroDePlanilha, lerAbasXlsx } from "@/lib/planilha";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

import { mesPorExtenso } from "./painel";
import { ErroDePlanilhaDeCusto, lerPlanilhaDeCusto, type PlanilhaLida } from "./planilha-de-custo";
import { planilhaVigente } from "./queries";
import {
  esquemaAbrirCompetencia,
  esquemaConferencia,
  esquemaDescarte,
  esquemaImportacao,
  esquemaLancamento,
  esquemaMudarCompetencia,
  primeiraMensagem,
} from "./schemas";

/**
 * Mutações do financeiro do contrato.
 *
 * Mesma ordem de toda action do Portal (CLAUDE.md): Zod → exigirPermissao →
 * operação com o client do usuário (a RLS ainda vale) → registrarAuditoria →
 * revalidatePath. O banco segura o resto sozinho: competência fechada,
 * posto de outra planilha, categoria incoerente, descarte sem motivo
 * (migração 0029). As mensagens desses gatilhos já saem em português.
 */

function revalidar(contratoId?: string) {
  revalidatePath("/admin/financeiro");
  if (contratoId) revalidatePath(`/admin/financeiro/${contratoId}`);
}

function traduzirErroDeBanco(codigo: string | undefined, mensagem: string): string {
  // Gatilhos da 0029: a mensagem foi escrita para a tela.
  if (codigo === "P0001") return mensagem;
  if (codigo === "23505") {
    if (mensagem.includes("competencias_mes_unico")) return "Esta competência já está aberta para o contrato.";
    if (mensagem.includes("planilhas_de_custo_versao_unica")) {
      return "Outra importação para este contrato terminou agora. Recarregue a página e confira as versões.";
    }
    return "Já existe um registro com esses dados.";
  }
  if (codigo === "42501") {
    return "Você não tem permissão para esta alteração neste contrato. Fale com o administrador do Portal.";
  }
  if (codigo === "23514") return "Algum valor não foi aceito. Confira o tipo, o valor e a descrição.";
  console.error("[financeiro] erro de banco não traduzido", codigo, mensagem);
  return "Não foi possível salvar. Tente de novo em alguns minutos; se continuar, avise o administrador do Portal.";
}

const textoDe = (f: FormData, campo: string) => {
  const v = f.get(campo);
  return typeof v === "string" ? v : "";
};

// =====================================================================
// Planilha de custo
// =====================================================================

async function lerArquivoDaPlanilha(formulario: FormData): Promise<{ nome: string; lida: PlanilhaLida }> {
  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    throw new ErroDePlanilha("Escolha o arquivo da planilha de custos (.xlsx).");
  }
  const abas = await lerAbasXlsx(arquivo);
  return { nome: arquivo.name, lida: lerPlanilhaDeCusto(abas) };
}

function mensagemDaPlanilha(erro: unknown): string {
  if (erro instanceof ErroDePlanilha || erro instanceof ErroDePlanilhaDeCusto) return erro.message;
  return mensagemDeErro(erro);
}

/** Lê a planilha e devolve o que seria gravado. Não grava nada. */
export async function previsualizarPlanilha(formulario: FormData): Promise<Resultado<PlanilhaLida>> {
  try {
    await exigirPermissao("financeiro", "criar");
    const { lida } = await lerArquivoDaPlanilha(formulario);
    return { ok: true, dados: lida };
  } catch (erro) {
    return { ok: false, erro: mensagemDaPlanilha(erro) };
  }
}

/**
 * Grava a planilha como versão nova do contrato.
 *
 * O arquivo é lido DE NOVO aqui: o servidor não confia na prévia que o
 * navegador mostrou. Cabeçalho e postos entram numa transação
 * (`gravar_planilha_de_custo`).
 */
export async function importarPlanilha(
  formulario: FormData,
): Promise<Resultado<{ versao: number; contratoId: string }>> {
  const validado = esquemaImportacao.safeParse({
    contrato_id: textoDe(formulario, "contrato_id"),
    vigente_desde: textoDe(formulario, "vigente_desde"),
    observacao: textoDe(formulario, "observacao"),
  });
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { contrato_id, vigente_desde, observacao } = validado.data;

  try {
    await exigirPermissao("financeiro", "criar");
    const { nome, lida } = await lerArquivoDaPlanilha(formulario);

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("gravar_planilha_de_custo", {
      p_contrato: contrato_id,
      p_vigente_desde: vigente_desde,
      // A RPC aceita nulo; o tipo gerado não sabe disso.
      p_meses: lida.meses_execucao as number,
      p_regime: lida.regime_tributario as string,
      p_arquivo: nome.slice(0, 200),
      p_observacao: observacao as string,
      p_postos: lida.postos.map((p) => ({
        cargo: p.cargo,
        quantidade: p.quantidade,
        valor_unitario: p.valor_unitario,
        ...p.composicao,
      })),
    });
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    const gravada = data?.[0];
    if (!gravada) return { ok: false, erro: "A planilha não foi gravada. Tente de novo." };

    await registrarAuditoria({
      acao: "importar",
      entidade: "planilhas_de_custo",
      entidadeId: gravada.planilha_id,
      detalhes: {
        contrato_id,
        versao: gravada.versao,
        vigente_desde,
        valor_mensal: lida.valor_mensal,
        postos: lida.postos.length,
        avisos: lida.avisos.length,
        arquivo: nome,
      },
    });

    revalidar(contrato_id);
    return { ok: true, dados: { versao: gravada.versao, contratoId: contrato_id } };
  } catch (erro) {
    return { ok: false, erro: mensagemDaPlanilha(erro) };
  }
}

// =====================================================================
// Competência
// =====================================================================

export async function abrirCompetencia(entrada: unknown): Promise<Resultado<{ mes: string }>> {
  const validado = esquemaAbrirCompetencia.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { contrato_id, mes } = validado.data;

  try {
    const usuario = await exigirPermissao("financeiro", "criar");
    const supabase = await criarClienteServidor();

    const { data: planilhas, error: erroPlanilhas } = await supabase
      .from("planilhas_de_custo")
      .select("id, versao, vigente_desde, status")
      .eq("contrato_id", contrato_id);
    if (erroPlanilhas) return { ok: false, erro: traduzirErroDeBanco(erroPlanilhas.code, erroPlanilhas.message) };

    const vigente = planilhaVigente(planilhas ?? [], mes);
    if (!vigente) {
      return {
        ok: false,
        erro: `Não há planilha de custo valendo em ${mesPorExtenso(mes)}. Importe a planilha do contrato antes de abrir o mês.`,
      };
    }

    const { data, error } = await supabase
      .from("competencias")
      .insert({ org_id: usuario.orgId, contrato_id, planilha_id: vigente.id, mes })
      .select("id")
      .single();
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "criar",
      entidade: "competencias",
      entidadeId: data.id,
      detalhes: { contrato_id, mes, planilha_versao: vigente.versao },
    });

    revalidar(contrato_id);
    return { ok: true, dados: { mes } };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

export async function mudarStatusCompetencia(entrada: unknown): Promise<Resultado> {
  const validado = esquemaMudarCompetencia.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { competencia_id, status } = validado.data;

  try {
    const usuario = await exigirPermissao("financeiro", "editar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("competencias")
      .update(
        status === "fechada"
          ? { status, fechada_em: new Date().toISOString(), fechada_por: usuario.id }
          : { status, fechada_em: null, fechada_por: null },
      )
      .eq("id", competencia_id)
      .select("contrato_id, mes")
      .maybeSingle();
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data) return { ok: false, erro: "Competência não encontrada." };

    await registrarAuditoria({
      acao: status === "fechada" ? "fechar" : "reabrir",
      entidade: "competencias",
      entidadeId: competencia_id,
      detalhes: { contrato_id: data.contrato_id, mes: data.mes },
    });

    revalidar(data.contrato_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Lançamento
// =====================================================================

/**
 * Lançamento feito na tela, com foto ou PDF da nota opcional.
 *
 * Nasce `confirmado`: quem lança pela tela é a própria equipe, e o que ela
 * digitou já é o conferido. O que chega pela IA segue outro caminho (fila
 * de conferência, `ia.ts`).
 */
export async function criarLancamento(formulario: FormData): Promise<Resultado> {
  const validado = esquemaLancamento.safeParse({
    competencia_id: textoDe(formulario, "competencia_id"),
    categoria: textoDe(formulario, "categoria"),
    descricao: textoDe(formulario, "descricao"),
    valor: textoDe(formulario, "valor"),
    data_documento: textoDe(formulario, "data_documento"),
    posto_id: textoDe(formulario, "posto_id"),
  });
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const entrada = validado.data;

  try {
    const usuario = await exigirPermissao("financeiro", "criar");

    let anexo: { conteudo: Uint8Array; mime: string; extensao: string; nome: string } | null = null;
    const arquivo = formulario.get("arquivo");
    if (arquivo instanceof File && arquivo.size > 0) {
      const conteudo = new Uint8Array(await arquivo.arrayBuffer());
      anexo = { conteudo, ...validarAnexo(conteudo), nome: arquivo.name.slice(0, 200) };
    }

    const supabase = await criarClienteServidor();
    const { data: competencia, error: erroCompetencia } = await supabase
      .from("competencias")
      .select("contrato_id")
      .eq("id", entrada.competencia_id)
      .maybeSingle();
    if (erroCompetencia) return { ok: false, erro: traduzirErroDeBanco(erroCompetencia.code, erroCompetencia.message) };
    if (!competencia) return { ok: false, erro: "Competência não encontrada. Recarregue a página." };

    const { data, error } = await supabase
      .from("lancamentos")
      .insert({
        org_id: usuario.orgId,
        contrato_id: competencia.contrato_id,
        competencia_id: entrada.competencia_id,
        posto_id: entrada.posto_id,
        natureza: entrada.natureza,
        categoria: entrada.categoria,
        descricao: entrada.descricao,
        valor: entrada.valor,
        data_documento: entrada.data_documento,
        origem: "plataforma",
        status: "confirmado",
        criado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    const anexou = anexo ? await anexar(usuario.orgId, usuario.id, data.id, anexo) : true;

    await registrarAuditoria({
      acao: "criar",
      entidade: "lancamentos",
      entidadeId: data.id,
      detalhes: {
        contrato_id: competencia.contrato_id,
        categoria: entrada.categoria,
        valor: entrada.valor,
        anexo: Boolean(anexo),
      },
    });

    revalidar(competencia.contrato_id);
    if (!anexou) {
      return {
        ok: false,
        erro: "O lançamento foi registrado, mas o arquivo não subiu. Abra o lançamento e envie de novo, ou guarde o comprovante.",
      };
    }
    return { ok: true };
  } catch (erro) {
    if (erro instanceof ErroDeAnexo) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Sobe o arquivo e registra. Nunca lança: o lançamento já existe. */
async function anexar(
  orgId: string,
  usuarioId: string,
  lancamentoId: string,
  anexo: { conteudo: Uint8Array; mime: string; extensao: string; nome: string },
): Promise<boolean> {
  const caminho = `${orgId}/lancamentos/${lancamentoId}/${crypto.randomUUID()}.${anexo.extensao}`;
  // service_role só para o Storage: o bucket não tem policy para ninguém
  // (invariante 3). A permissão já foi checada pela action e pela RLS do
  // insert do lançamento, que precisa ter passado para chegar aqui.
  const admin = criarClienteAdmin();
  const { error: erroUpload } = await admin.storage
    .from("financeiro")
    .upload(caminho, anexo.conteudo, { contentType: anexo.mime, upsert: false });
  if (erroUpload) {
    console.error("[financeiro] upload do anexo falhou", lancamentoId, erroUpload.message);
    return false;
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("lancamento_anexos").insert({
    org_id: orgId,
    lancamento_id: lancamentoId,
    nome: anexo.nome || `comprovante.${anexo.extensao}`,
    arquivo_path: caminho,
    mime: anexo.mime,
    bytes: anexo.conteudo.byteLength,
    enviado_por: usuarioId,
  });
  if (error) {
    console.error("[financeiro] registro do anexo falhou", lancamentoId, error.message);
    await admin.storage.from("financeiro").remove([caminho]);
    return false;
  }
  return true;
}

/** Confirma (e corrige, se preciso) um lançamento que a IA deixou em conferência. */
export async function conferirLancamento(entrada: unknown): Promise<Resultado> {
  const validado = esquemaConferencia.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { lancamento_id, ...campos } = validado.data;

  try {
    const usuario = await exigirPermissao("financeiro", "editar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("lancamentos")
      .update({
        ...campos,
        status: "confirmado",
        conferido_por: usuario.id,
        conferido_em: new Date().toISOString(),
      })
      .eq("id", lancamento_id)
      .eq("status", "em_conferencia")
      .select("contrato_id")
      .maybeSingle();
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data) return { ok: false, erro: "Este lançamento já foi conferido ou não está mais na fila. Recarregue a página." };

    await registrarAuditoria({
      acao: "conferir",
      entidade: "lancamentos",
      entidadeId: lancamento_id,
      detalhes: { contrato_id: data.contrato_id, categoria: campos.categoria, valor: campos.valor },
    });

    revalidar(data.contrato_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

/** Lançamento errado não se apaga: vira `descartado`, com motivo (invariante 8). */
export async function descartarLancamento(entrada: unknown): Promise<Resultado> {
  const validado = esquemaDescarte.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { lancamento_id, motivo } = validado.data;

  try {
    const usuario = await exigirPermissao("financeiro", "editar");
    const supabase = await criarClienteServidor();

    const { data, error } = await supabase
      .from("lancamentos")
      .update({
        status: "descartado",
        motivo_descarte: motivo,
        conferido_por: usuario.id,
        conferido_em: new Date().toISOString(),
      })
      .eq("id", lancamento_id)
      .select("contrato_id")
      .maybeSingle();
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };
    if (!data) return { ok: false, erro: "Lançamento não encontrado." };

    await registrarAuditoria({
      acao: "descartar",
      entidade: "lancamentos",
      entidadeId: lancamento_id,
      detalhes: { contrato_id: data.contrato_id, motivo },
    });

    revalidar(data.contrato_id);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
