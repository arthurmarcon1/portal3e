"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { validarPdf, ErroDeArquivo } from "@/features/documentos/arquivo";
import { gravarRascunho, traduzirErroDeBanco } from "@/features/documentos/gravacao";
import { registrarAuditoria } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/sessao";
import { data, primeiraMensagem, uuid } from "@/lib/campos-zod";
import { ErroDeNegocio, mensagemDeErro, type Resultado } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/server";

import {
  casarArquivos,
  compilarRegra,
  competenciaDoMes,
  ErroDeRegra,
  MAX_EXPRESSAO,
  MAX_NOME,
  MOTIVOS,
  nomeBase,
  rotuloCompetencia,
  type Casamento,
} from "./casamento";
import { dadosDoLote, tipoEspelhoId } from "./queries";

/**
 * Publicação de espelhos em lote (F4.1).
 *
 * Três passos, e o segundo não se pula:
 * 1. **analisar** — só os NOMES dos arquivos vão ao servidor; ele casa com
 *    as pessoas que a RLS mostra ao usuário e devolve casados, não casados
 *    (com o motivo) e pessoas sem espelho. O CPF de ninguém volta à tela;
 * 2. a tela mostra a lista de não casados — "nada é publicado sem ver";
 * 3. **publicar**, em lotes pequenos (a Server Action tem teto de 8 MB):
 *    cada lote refaz o casamento no servidor, com os dados de agora — o que a
 *    tela mandou não é prova, e um lote anterior pode ter acabado de publicar
 *    a mesma pessoa. Cada espelho segue o caminho da F3.1: rascunho pela RLS,
 *    arquivo, publicação (o trigger carimba, aplica o prazo e notifica).
 *
 * Permissão: `jornada:criar` na action (matriz de docs/02: Admin geral e
 * RH/DP). A RLS de `documentos` pede ainda `documentos:editar` e a
 * categoria `jornada` — as duas camadas precisam concordar.
 */

const esquemaRegra = z.object({
  expressao: z.string().trim().min(1, "Informe a expressão.").max(MAX_EXPRESSAO),
  campo: z.enum(["cpf", "matricula"]),
});

const esquemaLote = esquemaRegra.extend({
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Escolha o mês de competência."),
  contrato_id: uuid.nullable().default(null),
});

const esquemaAnalise = esquemaLote.extend({
  nomes: z
    .array(z.string().min(1).max(MAX_NOME))
    .min(1, "Escolha ao menos um arquivo.")
    .max(3000, "No máximo 3.000 arquivos por lote."),
});

const esquemaPublicacao = esquemaLote.extend({ prazo_ciencia: data });

/** Com a competência, sai o título que a pessoa vê: "Espelho de ponto — 08/2026". */
function tituloDoEspelho(competencia: string): string {
  return `Espelho de ponto — ${rotuloCompetencia(competencia)}`;
}

// =====================================================================
// Regra
// =====================================================================

export async function salvarRegraEspelho(entrada: unknown): Promise<Resultado> {
  const validado = esquemaRegra.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };

  try {
    compilarRegra(validado.data.expressao);
    const usuario = await exigirPermissao("jornada", "editar");
    const supabase = await criarClienteServidor();

    const { error } = await supabase.from("regras_espelho").upsert({
      org_id: usuario.orgId,
      expressao: validado.data.expressao,
      campo: validado.data.campo,
      atualizado_por: usuario.id,
    });
    if (error) return { ok: false, erro: traduzirErroDeBanco(error.code, error.message) };

    await registrarAuditoria({
      acao: "editar",
      entidade: "regras_espelho",
      entidadeId: usuario.orgId,
      detalhes: validado.data,
    });
    revalidatePath("/admin/jornada/publicar");
    return { ok: true };
  } catch (erro) {
    if (erro instanceof ErroDeRegra) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Análise
// =====================================================================

export type AnaliseDoLote = Casamento & { competencia: string };

export async function analisarLoteEspelhos(entrada: unknown): Promise<Resultado<AnaliseDoLote>> {
  const validado = esquemaAnalise.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { nomes, expressao, campo, contrato_id } = validado.data;
  const competencia = competenciaDoMes(validado.data.competencia)!;

  try {
    await exigirPermissao("jornada", "criar");
    const lote = await dadosDoLote(competencia, contrato_id);
    const casamento = casarArquivos(
      nomes,
      { expressao, campo },
      lote.pessoas,
      lote.esperadas,
      lote.jaPublicadas,
    );
    return { ok: true, dados: { ...casamento, competencia } };
  } catch (erro) {
    if (erro instanceof ErroDeRegra) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}

// =====================================================================
// Publicação
// =====================================================================

export type ResultadoDoLote = {
  publicados: { arquivo: string; pessoaNome: string; documentoId: string }[];
  recusados: { arquivo: string; motivo: string }[];
};

export async function publicarLoteEspelhos(formData: FormData): Promise<Resultado<ResultadoDoLote>> {
  let bruto: unknown = null;
  try {
    bruto = JSON.parse(String(formData.get("dados") ?? "null"));
  } catch {
    // cai no Zod
  }
  const validado = esquemaPublicacao.safeParse(bruto);
  if (!validado.success) return { ok: false, erro: primeiraMensagem(validado.error) };
  const { expressao, campo, contrato_id, prazo_ciencia } = validado.data;
  const competencia = competenciaDoMes(validado.data.competencia)!;

  const arquivos = formData.getAll("arquivos").filter((a): a is File => a instanceof File);
  if (arquivos.length === 0) return { ok: false, erro: "Nenhum arquivo neste lote." };
  if (arquivos.length > 50) return { ok: false, erro: "No máximo 50 arquivos por envio." };

  try {
    const usuario = await exigirPermissao("jornada", "criar");
    const tipoId = await tipoEspelhoId();
    const lote = await dadosDoLote(competencia, contrato_id);

    // O casamento é refeito aqui, com o estado de agora.
    const porNome = new Map(arquivos.map((a) => [a.name, a]));
    const casamento = casarArquivos(
      [...porNome.keys()],
      { expressao, campo },
      lote.pessoas,
      lote.esperadas,
      lote.jaPublicadas,
    );

    const resultado: ResultadoDoLote = {
      publicados: [],
      recusados: casamento.naoCasados.map((n) => ({ arquivo: n.arquivo, motivo: MOTIVOS[n.motivo] })),
    };

    const supabase = await criarClienteServidor();
    const titulo = tituloDoEspelho(competencia);

    for (const casado of casamento.casados) {
      try {
        const conteudo = new Uint8Array(await porNome.get(casado.arquivo)!.arrayBuffer());
        validarPdf(conteudo);

        const id = await gravarRascunho({
          orgId: usuario.orgId,
          tipoId,
          escopo: "individual",
          pessoaId: casado.pessoaId,
          titulo,
          descricao: null,
          substituiId: null,
          competencia,
          publicos: [],
          conteudo,
        });

        const { error } = await supabase
          .from("documentos")
          .update({ status: "publicado", prazo_ciencia })
          .eq("id", id)
          .eq("status", "rascunho");
        if (error) {
          // O rascunho fica: aparece em /admin/documentos para publicar ou
          // descartar à mão. Apagá-lo aqui esconderia o que deu errado.
          throw new ErroDeNegocio(traduzirErroDeBanco(error.code, error.message));
        }

        await registrarAuditoria({
          acao: "publicar",
          entidade: "documentos",
          entidadeId: id,
          detalhes: {
            titulo,
            competencia,
            lote: true,
            arquivo: nomeBase(casado.arquivo),
            pessoa_id: casado.pessoaId,
          },
        });
        resultado.publicados.push({ arquivo: casado.arquivo, pessoaNome: casado.pessoaNome, documentoId: id });
      } catch (erro) {
        resultado.recusados.push({
          arquivo: casado.arquivo,
          motivo:
            erro instanceof ErroDeArquivo || erro instanceof ErroDeNegocio
              ? erro.message
              : mensagemDeErro(erro),
        });
      }
    }

    revalidatePath("/admin/documentos");
    return { ok: true, dados: resultado };
  } catch (erro) {
    if (erro instanceof ErroDeRegra) return { ok: false, erro: erro.message };
    return { ok: false, erro: mensagemDeErro(erro) };
  }
}
