"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FiltroSelecao, TODOS } from "@/components/tabela/filtro-selecao";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { formatarData } from "@/features/documentos/formato";
import { ROTULO_SITUACAO, type LinhaDeConformidade, type Situacao } from "@/features/sst/conformidade";

const helper = criarColunas<LinhaDeConformidade>();

const COR: Record<Situacao, string> = { vencido: "text-erro", a_vencer: "text-alerta", em_dia: "text-sucesso" };

/** Padrão "pendentes": o que pede ação primeiro. */
const PENDENTES = "pendentes";

export function TelaConformidade({ linhas }: { linhas: LinhaDeConformidade[] }) {
  const [contrato, setContrato] = useState(TODOS);
  const [unidade, setUnidade] = useState(TODOS);
  const [situacao, setSituacao] = useState<string>(PENDENTES);

  const opcoesContrato = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const l of linhas) for (const lot of l.lotacoes) vistos.set(lot.contrato_id, lot.contrato_numero);
    return [...vistos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhas]);

  const opcoesUnidade = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const l of linhas)
      for (const lot of l.lotacoes) if (contrato === TODOS || lot.contrato_id === contrato) vistos.set(lot.unidade_id, lot.unidade_nome);
    return [...vistos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhas, contrato]);

  const visiveis = useMemo(
    () =>
      linhas.filter(
        (l) =>
          (situacao === TODOS || (situacao === PENDENTES ? l.situacao !== "em_dia" : l.situacao === situacao)) &&
          l.lotacoes.some(
            (lot) => (contrato === TODOS || lot.contrato_id === contrato) && (unidade === TODOS || lot.unidade_id === unidade),
          ),
      ),
    [linhas, contrato, unidade, situacao],
  );

  const colunas = useMemo<ColunaDe<LinhaDeConformidade>[]>(
    () =>
      helper.columns([
        helper.accessor("pessoa_nome", { header: "Pessoa", cell: (ctx) => <span className="font-medium">{ctx.getValue()}</span> }),
        helper.accessor("titulo", {
          header: "Documento",
          cell: (ctx) => (
            <Link
              href={`/admin/documentos/${ctx.row.original.documento_id}`}
              className="text-acao underline-offset-2 hover:underline"
            >
              {ctx.getValue()}
              <span className="block text-xs text-texto-suave">{ctx.row.original.tipo_nome}</span>
            </Link>
          ),
        }),
        helper.display({
          id: "lotacao",
          header: "Contrato · unidade",
          cell: (ctx) => (
            <span>
              {ctx.row.original.lotacoes.map((l) => (
                <span key={`${l.contrato_id}:${l.unidade_id}`} className="block">
                  {l.contrato_numero} · {l.unidade_nome}
                </span>
              ))}
            </span>
          ),
        }),
        helper.accessor("valido_ate", {
          header: "Válido até",
          cell: (ctx) => <span className="tabular-nums">{formatarData(ctx.getValue())}</span>,
        }),
        helper.accessor("situacao", {
          header: "Situação",
          cell: (ctx) => {
            const { situacao: s, dias } = ctx.row.original;
            return (
              <span className={COR[s]}>
                {ROTULO_SITUACAO[s]}
                {s === "vencido" ? (
                  <span className="block text-xs">há {-dias} {dias === -1 ? "dia" : "dias"}</span>
                ) : s === "a_vencer" ? (
                  <span className="block text-xs">{dias === 0 ? "hoje" : `em ${dias} ${dias === 1 ? "dia" : "dias"}`}</span>
                ) : null}
              </span>
            );
          },
        }),
      ]) as ColunaDe<LinhaDeConformidade>[],
    [],
  );

  return (
    <TabelaDados
      colunas={colunas}
      dados={visiveis}
      camposDeBusca={(l) => `${l.pessoa_nome} ${l.titulo} ${l.tipo_nome}`}
      rotuloBusca="Buscar por pessoa ou documento"
      substantivo={["documento", "documentos"]}
      filtros={
        <>
          <FiltroSelecao
            rotulo="Contrato"
            opcoes={opcoesContrato}
            valor={contrato}
            aoMudar={(v) => {
              setContrato(v);
              setUnidade(TODOS);
            }}
            largura="w-40"
          />
          <FiltroSelecao rotulo="Unidade" opcoes={opcoesUnidade} valor={unidade} aoMudar={setUnidade} />
          <FiltroSelecao
            rotulo="Situação"
            opcoes={[
              { id: PENDENTES, nome: "Vencidos e a vencer" },
              { id: "vencido", nome: ROTULO_SITUACAO.vencido },
              { id: "a_vencer", nome: ROTULO_SITUACAO.a_vencer },
              { id: "em_dia", nome: ROTULO_SITUACAO.em_dia },
            ]}
            valor={situacao}
            aoMudar={setSituacao}
            largura="w-52"
          />
        </>
      }
      vazio={{
        titulo: "Nada vencido nem a vencer.",
        descricao: "ASO e certificados de treinamento aparecem aqui quando publicados com a data de validade.",
      }}
    />
  );
}
