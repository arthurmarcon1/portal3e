"use client";

import { useMemo, useState } from "react";

import { FiltroSelecao, TODOS } from "@/components/tabela/filtro-selecao";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { formatarData } from "@/features/documentos/formato";
import { cpfParcial, ROTULO_SITUACAO, type PessoaDoQuadro } from "@/features/contratante/quadro";

const helper = criarColunas<PessoaDoQuadro>();

export function TelaQuadro({ dados }: { dados: PessoaDoQuadro[] }) {
  const [unidade, setUnidade] = useState(TODOS);
  const [situacao, setSituacao] = useState(TODOS);

  const opcoesUnidade = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const p of dados) vistos.set(p.unidade_id, p.unidade_nome);
    return [...vistos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dados]);

  const opcoesSituacao = useMemo(
    () => (["ativa", "ferias", "afastado"] as const).map((s) => ({ id: s, nome: ROTULO_SITUACAO[s] })),
    [],
  );

  const visiveis = useMemo(
    () =>
      dados.filter(
        (p) => (unidade === TODOS || p.unidade_id === unidade) && (situacao === TODOS || p.situacao === situacao),
      ),
    [dados, unidade, situacao],
  );

  const colunas = useMemo<ColunaDe<PessoaDoQuadro>[]>(
    () =>
      helper.columns([
        helper.accessor("nome", { header: "Nome", cell: (ctx) => <span className="font-medium">{ctx.getValue()}</span> }),
        helper.accessor("matricula", {
          header: "Matrícula",
          cell: (ctx) => <span className="tabular-nums">{ctx.getValue() ?? "—"}</span>,
        }),
        helper.accessor("cpf_final", {
          header: "CPF",
          cell: (ctx) => <span className="whitespace-nowrap tabular-nums">{cpfParcial(ctx.getValue())}</span>,
        }),
        helper.accessor("funcao", { header: "Função" }),
        helper.accessor("unidade_nome", {
          header: "Unidade",
          cell: (ctx) => (
            <span>
              {ctx.getValue()}
              <span className="block text-xs text-texto-suave">contrato {ctx.row.original.contrato_numero}</span>
            </span>
          ),
        }),
        helper.accessor("situacao", {
          header: "Situação",
          cell: (ctx) => (
            <span className={ctx.getValue() === "ativa" ? undefined : "text-alerta"}>{ROTULO_SITUACAO[ctx.getValue()]}</span>
          ),
        }),
        helper.accessor("data_inicio", {
          header: "Início",
          cell: (ctx) => <span className="tabular-nums">{formatarData(ctx.getValue())}</span>,
        }),
      ]) as ColunaDe<PessoaDoQuadro>[],
    [],
  );

  return (
    <TabelaDados
      colunas={colunas}
      dados={visiveis}
      camposDeBusca={(p) => `${p.nome} ${p.matricula ?? ""} ${p.funcao} ${p.unidade_nome}`}
      rotuloBusca="Buscar por nome, matrícula ou função"
      substantivo={["alocação", "alocações"]}
      filtros={
        <>
          <FiltroSelecao rotulo="Unidade" opcoes={opcoesUnidade} valor={unidade} aoMudar={setUnidade} />
          <FiltroSelecao rotulo="Situação" opcoes={opcoesSituacao} valor={situacao} aoMudar={setSituacao} largura="w-40" />
        </>
      }
      vazio={{
        titulo: "Ninguém alocado nos seus contratos hoje.",
        descricao: "Quando a 3e alocar alguém num contrato ou unidade seus, a pessoa aparece aqui.",
      }}
    />
  );
}
