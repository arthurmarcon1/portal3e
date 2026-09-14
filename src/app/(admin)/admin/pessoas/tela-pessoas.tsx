"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { FiltroSelecao, TODOS } from "@/components/tabela/filtro-selecao";
import { FiltroSituacao, useFiltroSituacao } from "@/components/tabela/filtro-situacao";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { Button } from "@/components/ui/button";
import type { PessoaLinha } from "@/features/pessoas/queries";
import { formatarCpf } from "@/lib/cpf-cnpj";

import { FormularioPessoa } from "./formulario-pessoa";

const helper = criarColunas<PessoaLinha>();

/** Situação da alocação — vocabulário próprio, diferente do `status` da pessoa. */
const SITUACAO_ALOCACAO: Record<string, string> = {
  ativa: "Alocado",
  ferias: "Em férias",
  afastado: "Afastado",
  encerrada: "Encerrada",
};

/**
 * Listagem do quadro.
 *
 * Daqui só se cadastra e se navega: **editar e alocar acontecem na ficha**,
 * que é quem carrega o registro inteiro. Abrir o formulário de edição com a
 * linha da listagem gravaria `null` em nascimento, endereço e e-mail — campos
 * que esta consulta nem busca.
 */
export function TelaPessoas({
  dados,
  podeCriar,
}: {
  dados: PessoaLinha[];
  podeCriar: boolean;
}) {
  const router = useRouter();
  const [emFormulario, setEmFormulario] = useState<"nova" | null>(null);
  const [contrato, setContrato] = useState(TODOS);
  const [unidade, setUnidade] = useState(TODOS);
  const [funcao, setFuncao] = useState(TODOS);
  const { situacao, setSituacao, aplicar } = useFiltroSituacao();

  // As opções saem do que está na tela, não de uma consulta à parte: filtro
  // que oferece um contrato sem ninguém alocado só rende lista vazia.
  const opcoesContrato = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const p of dados) {
      for (const a of p.vigentes) vistos.set(a.contrato_id, a.contrato_numero);
    }
    return [...vistos]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dados]);

  const opcoesUnidade = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const p of dados) {
      for (const a of p.vigentes) {
        // Unidade acompanha o contrato escolhido, para não oferecer
        // combinação que não existe no quadro.
        if (contrato !== TODOS && a.contrato_id !== contrato) continue;
        vistos.set(a.unidade_id, a.unidade_nome);
      }
    }
    return [...vistos]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dados, contrato]);

  const opcoesFuncao = useMemo(() => {
    const vistos = new Set<string>();
    for (const p of dados) {
      for (const a of p.vigentes) vistos.add(a.funcao);
    }
    return [...vistos]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((f) => ({ id: f, nome: f }));
  }, [dados]);

  const visiveis = useMemo(() => {
    const porSituacao = aplicar(dados);
    if (contrato === TODOS && unidade === TODOS && funcao === TODOS) return porSituacao;

    // Uma pessoa pode ter mais de uma alocação vigente: basta que UMA delas
    // atenda a todos os filtros marcados.
    return porSituacao.filter((p) =>
      p.vigentes.some(
        (a) =>
          (contrato === TODOS || a.contrato_id === contrato) &&
          (unidade === TODOS || a.unidade_id === unidade) &&
          (funcao === TODOS || a.funcao === funcao),
      ),
    );
  }, [aplicar, dados, contrato, unidade, funcao]);

  const colunas = useMemo<ColunaDe<PessoaLinha>[]>(
    () =>
      helper.columns([
        helper.accessor("nome", {
          header: "Nome",
          cell: (ctx) => (
            <Link
              href={`/admin/pessoas/${ctx.row.original.id}`}
              className="font-medium text-acao underline-offset-2 hover:underline"
            >
              {ctx.getValue()}
            </Link>
          ),
        }),
        helper.accessor("cpf", {
          header: "CPF",
          cell: (ctx) => (
            <span className="tabular-nums whitespace-nowrap">
              {formatarCpf(ctx.getValue())}
            </span>
          ),
        }),
        helper.accessor("matricula", {
          header: "Matrícula",
          cell: (ctx) => (
            <span className="tabular-nums">{ctx.getValue() ?? "—"}</span>
          ),
        }),
        helper.display({
          id: "alocacao",
          header: "Alocação",
          cell: (ctx) => {
            const [primeira, ...resto] = ctx.row.original.vigentes;
            if (!primeira) {
              return <span className="text-alerta">Sem alocação</span>;
            }
            return (
              <span>
                {primeira.contrato_numero} · {primeira.unidade_nome}
                {resto.length > 0 ? ` e mais ${resto.length}` : ""}
              </span>
            );
          },
        }),
        helper.display({
          id: "funcao",
          header: "Função",
          cell: (ctx) => {
            const primeira = ctx.row.original.vigentes[0];
            if (!primeira) return <span className="text-texto-suave">—</span>;
            return (
              <span>
                {primeira.funcao}
                {primeira.status !== "ativa" ? (
                  <span className="block text-xs text-alerta">
                    {SITUACAO_ALOCACAO[primeira.status] ?? primeira.status}
                  </span>
                ) : null}
              </span>
            );
          },
        }),
        helper.accessor("status", {
          header: "Situação",
          cell: (ctx) => <BadgeStatus status={ctx.getValue()} />,
        }),
      ]) as ColunaDe<PessoaLinha>[],
    [],
  );

  return (
    <>
      <TabelaDados
        colunas={colunas}
        dados={visiveis}
        camposDeBusca={(p) =>
          `${p.nome} ${p.cpf} ${formatarCpf(p.cpf)} ${p.matricula ?? ""} ${p.vigentes
            .map((a) => `${a.funcao} ${a.contrato_numero} ${a.unidade_nome}`)
            .join(" ")}`
        }
        rotuloBusca="Buscar por nome, CPF ou matrícula"
        substantivo={["pessoa", "pessoas"]}
        filtros={
          <>
            <FiltroSelecao
              rotulo="Contrato"
              opcoes={opcoesContrato}
              valor={contrato}
              aoMudar={(v) => {
                setContrato(v);
                // Trocar de contrato invalida a unidade escolhida.
                setUnidade(TODOS);
              }}
              largura="w-40"
            />
            <FiltroSelecao
              rotulo="Unidade"
              opcoes={opcoesUnidade}
              valor={unidade}
              aoMudar={setUnidade}
            />
            <FiltroSelecao
              rotulo="Função"
              opcoes={opcoesFuncao}
              valor={funcao}
              aoMudar={setFuncao}
            />
            <FiltroSituacao valor={situacao} aoMudar={setSituacao} />
          </>
        }
        acao={
          podeCriar ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/pessoas/importar">
                  <Upload aria-hidden strokeWidth={1.5} />
                  Importar planilha
                </Link>
              </Button>
              <Button type="button" onClick={() => setEmFormulario("nova")}>
                <Plus aria-hidden strokeWidth={1.5} />
                Nova pessoa
              </Button>
            </div>
          ) : undefined
        }
        vazio={{
          titulo: "Nenhuma pessoa cadastrada ainda.",
          descricao: podeCriar
            ? "Cadastre uma pessoa de cada vez ou importe o quadro inteiro de uma planilha."
            : "Quando o quadro for cadastrado, ele aparece aqui.",
        }}
      />

      <FormularioPessoa
        alvo={emFormulario}
        aoFechar={() => setEmFormulario(null)}
        // Cadastro feito, o próximo passo é alocar — e isso acontece na ficha.
        aoCriar={(id) => router.push(`/admin/pessoas/${id}`)}
      />
    </>
  );
}
