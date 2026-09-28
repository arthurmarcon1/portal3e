"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BadgeSituacao } from "@/components/solicitacoes/badge-situacao";
import { FiltroSelecao, TODOS } from "@/components/tabela/filtro-selecao";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { formatarData } from "@/features/documentos/formato";
import {
  encerrada,
  ROTULO_STATUS_INTERNO,
  ROTULO_TIPO,
  vencida,
  type StatusSolicitacao,
  type TipoSolicitacao,
} from "@/features/solicitacoes/fluxo";
import type { SolicitacaoLinha } from "@/features/solicitacoes/queries";
import { cn } from "@/lib/utils";

const helper = criarColunas<SolicitacaoLinha>();

const EM_ABERTO = "em_aberto";
const SEM_RESPONSAVEL = "sem";
const COMIGO = "comigo";

/**
 * Caixa de entrada da equipe interna (F4.2): filtro por tipo, situação,
 * responsável e prazo. Abre mostrando o que está em aberto — o que já
 * encerrou só aparece se pedido.
 */
export function TelaCaixa({
  dados,
  responsaveis,
  usuarioId,
  hoje,
}: {
  dados: SolicitacaoLinha[];
  responsaveis: { id: string; nome: string }[];
  usuarioId: string;
  hoje: string;
}) {
  const [tipo, setTipo] = useState(TODOS);
  const [status, setStatus] = useState(EM_ABERTO);
  const [responsavel, setResponsavel] = useState(TODOS);
  const [prazo, setPrazo] = useState(TODOS);
  const nomes = useMemo(() => new Map(responsaveis.map((r) => [r.id, r.nome])), [responsaveis]);

  const visiveis = useMemo(
    () =>
      dados.filter((s) => {
        if (tipo !== TODOS && s.tipo !== tipo) return false;
        if (status === EM_ABERTO ? encerrada(s.status) : status !== TODOS && s.status !== status) return false;
        if (responsavel === SEM_RESPONSAVEL && s.responsavel_id) return false;
        if (responsavel === COMIGO && s.responsavel_id !== usuarioId) return false;
        if (![TODOS, SEM_RESPONSAVEL, COMIGO].includes(responsavel) && s.responsavel_id !== responsavel) return false;
        if (prazo === "vencidas" && !vencida(s.prazo, s.status, hoje)) return false;
        return true;
      }),
    [dados, tipo, status, responsavel, prazo, usuarioId, hoje],
  );

  const colunas = useMemo<ColunaDe<SolicitacaoLinha>[]>(
    () =>
      helper.columns([
        helper.accessor("protocolo", {
          header: "Protocolo",
          cell: (ctx) => (
            <Link
              href={`/admin/solicitacoes/${ctx.row.original.id}`}
              className="font-medium text-acao tabular-nums underline-offset-2 hover:underline"
            >
              {ctx.getValue()}
            </Link>
          ),
        }),
        helper.accessor("tipo", { header: "Tipo", cell: (ctx) => ROTULO_TIPO[ctx.getValue()] }),
        helper.display({
          id: "de",
          header: "De",
          cell: (ctx) => {
            const s = ctx.row.original;
            return s.pessoa_nome ?? (s.contrato_numero ? `Contrato ${s.contrato_numero}` : "—");
          },
        }),
        helper.accessor("responsavel_id", {
          header: "Responsável",
          cell: (ctx) => {
            const id = ctx.getValue();
            if (!id) return <span className="text-alerta">Sem responsável</span>;
            return id === usuarioId ? "Você" : (nomes.get(id) ?? "—");
          },
        }),
        helper.accessor("prazo", {
          header: "Prazo",
          cell: (ctx) => {
            const s = ctx.row.original;
            const atrasada = vencida(s.prazo, s.status, hoje);
            return (
              <span className={cn("tabular-nums whitespace-nowrap", atrasada && "font-medium text-erro")}>
                {formatarData(s.prazo)}
                {atrasada ? " · vencida" : ""}
              </span>
            );
          },
        }),
        helper.accessor("status", {
          header: "Situação",
          cell: (ctx) => <BadgeSituacao status={ctx.getValue()} perspectiva="interno" />,
        }),
      ]) as ColunaDe<SolicitacaoLinha>[],
    [nomes, usuarioId, hoje],
  );

  return (
    <TabelaDados
      colunas={colunas}
      dados={visiveis}
      camposDeBusca={(s) => `${s.protocolo} ${s.titulo} ${s.pessoa_nome ?? ""} ${s.contrato_numero ?? ""}`}
      rotuloBusca="Buscar por protocolo, pessoa ou contrato"
      substantivo={["solicitação", "solicitações"]}
      filtros={
        <>
          <FiltroSelecao
            rotulo="Tipo"
            opcoes={(Object.keys(ROTULO_TIPO) as TipoSolicitacao[]).map((t) => ({ id: t, nome: ROTULO_TIPO[t] }))}
            valor={tipo}
            aoMudar={setTipo}
            largura="w-44"
          />
          <FiltroSelecao
            rotulo="Situação"
            opcoes={[
              { id: EM_ABERTO, nome: "Em aberto" },
              ...(Object.keys(ROTULO_STATUS_INTERNO) as StatusSolicitacao[]).map((s) => ({
                id: s,
                nome: ROTULO_STATUS_INTERNO[s],
              })),
            ]}
            valor={status}
            aoMudar={setStatus}
            rotuloTodos="Todas"
            largura="w-48"
          />
          <FiltroSelecao
            rotulo="Responsável"
            opcoes={[
              { id: COMIGO, nome: "Comigo" },
              { id: SEM_RESPONSAVEL, nome: "Sem responsável" },
              ...responsaveis.filter((r) => r.id !== usuarioId),
            ]}
            valor={responsavel}
            aoMudar={setResponsavel}
          />
          <FiltroSelecao
            rotulo="Prazo"
            opcoes={[{ id: "vencidas", nome: "Vencidas" }]}
            valor={prazo}
            aoMudar={setPrazo}
            rotuloTodos="Qualquer"
            largura="w-36"
          />
        </>
      }
      vazio={{
        titulo: "Nenhuma solicitação neste filtro.",
        descricao: "Quando um funcionário ou contratante abrir um pedido, ele aparece aqui.",
      }}
    />
  );
}
