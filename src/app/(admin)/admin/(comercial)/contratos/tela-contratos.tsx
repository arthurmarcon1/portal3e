"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BadgeStatus } from "@/components/badge-status";
import { DialogoConfirmacao } from "@/components/dialogo-confirmacao";
import { MenuLinha } from "@/components/menu-linha";
import { FiltroSituacao, useFiltroSituacao } from "@/components/tabela/filtro-situacao";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { mudarStatusContrato } from "@/features/contratos/actions";
import type { Contrato, Opcao } from "@/features/contratos/queries";

import { FormularioContrato } from "./formulario-contrato";

const helper = criarColunas<Contrato>();

/** dd/mm/aaaa a partir do ISO do banco, sem passar por Date (evita fuso). */
function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function TelaContratos({
  dados,
  contratantes,
  unidadesPorContratante,
  podeCriar,
  podeEditar,
}: {
  dados: Contrato[];
  contratantes: Opcao[];
  unidadesPorContratante: Record<string, Opcao[]>;
  podeCriar: boolean;
  podeEditar: boolean;
}) {
  const [emFormulario, setEmFormulario] = useState<Contrato | "novo" | null>(null);
  const [paraDesativar, setParaDesativar] = useState<Contrato | null>(null);
  const { situacao, setSituacao, aplicar } = useFiltroSituacao();

  const visiveis = useMemo(() => aplicar(dados), [aplicar, dados]);

  const colunas = useMemo<ColunaDe<Contrato>[]>(
    () =>
      helper.columns([
        helper.accessor("numero", {
          header: "Número",
          cell: (ctx) => <span className="tabular-nums">{ctx.getValue()}</span>,
        }),
        helper.accessor("contratante_nome", { header: "Contratante" }),
        helper.display({
          id: "unidades",
          header: "Unidades",
          cell: (ctx) => {
            const lista = ctx.row.original.unidades;
            if (lista.length === 0) {
              return <span className="text-alerta">Nenhuma vinculada</span>;
            }
            // Uma ou duas cabem inteiras; daí em diante, contagem.
            return lista.length <= 2
              ? lista.map((u) => u.nome).join(", ")
              : `${lista[0].nome} e mais ${lista.length - 1}`;
          },
        }),
        helper.display({
          id: "vigencia",
          header: "Vigência",
          cell: (ctx) => {
            const { vigencia_inicio, vigencia_fim } = ctx.row.original;
            if (!vigencia_inicio && !vigencia_fim) {
              return <span className="text-texto-suave">—</span>;
            }
            return (
              <span className="tabular-nums whitespace-nowrap">
                {dataBr(vigencia_inicio)} a {dataBr(vigencia_fim)}
              </span>
            );
          },
        }),
        helper.accessor("status", {
          header: "Situação",
          cell: (ctx) => <BadgeStatus status={ctx.getValue()} />,
        }),
        helper.display({
          id: "acoes",
          header: () => <span className="sr-only">Ações</span>,
          cell: (ctx) => {
            const linha = ctx.row.original;
            if (!podeEditar) return null;
            return (
              <MenuLinha>
                <DropdownMenuItem onSelect={() => setEmFormulario(linha)}>
                  Editar
                </DropdownMenuItem>
                {linha.status === "ativo" ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setParaDesativar(linha)}
                  >
                    Desativar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={async () => {
                      const r = await mudarStatusContrato({
                        id: linha.id,
                        status: "ativo",
                      });
                      if (r.ok) toast.success(`Contrato ${linha.numero} reativado.`);
                      else toast.error(r.erro);
                    }}
                  >
                    Reativar
                  </DropdownMenuItem>
                )}
              </MenuLinha>
            );
          },
        }),
      ]) as ColunaDe<Contrato>[],
    [podeEditar],
  );

  return (
    <>
      <TabelaDados
        colunas={colunas}
        dados={visiveis}
        camposDeBusca={(c) =>
          `${c.numero} ${c.contratante_nome} ${c.descricao ?? ""} ${c.unidades
            .map((u) => u.nome)
            .join(" ")}`
        }
        rotuloBusca="Buscar por número, contratante ou unidade"
        substantivo={["contrato", "contratos"]}
        filtros={<FiltroSituacao valor={situacao} aoMudar={setSituacao} />}
        acao={
          podeCriar ? (
            <Button
              type="button"
              onClick={() => setEmFormulario("novo")}
              disabled={contratantes.length === 0}
            >
              <Plus aria-hidden strokeWidth={1.5} />
              Novo contrato
            </Button>
          ) : undefined
        }
        vazio={{
          titulo: "Nenhum contrato cadastrado ainda.",
          descricao:
            contratantes.length === 0
              ? "Cadastre um contratante ativo primeiro — todo contrato pertence a um."
              : "O contrato é o que liga a 3e à contratante. É por ele que o escopo do cliente e as alocações são definidos.",
        }}
      />

      <FormularioContrato
        alvo={emFormulario}
        contratantes={contratantes}
        unidadesPorContratante={unidadesPorContratante}
        aoFechar={() => setEmFormulario(null)}
      />

      <DialogoConfirmacao
        aberto={paraDesativar !== null}
        aoFechar={() => setParaDesativar(null)}
        titulo="Desativar contrato"
        descricao={
          <>
            O contrato <strong>{paraDesativar?.numero}</strong> sai das listas de
            seleção. As alocações, os documentos e o histórico continuam no Portal —
            nada é apagado.
          </>
        }
        rotuloAcao="Desativar contrato"
        aoConfirmar={async () => {
          if (!paraDesativar) return;
          const r = await mudarStatusContrato({ id: paraDesativar.id, status: "inativo" });
          if (r.ok) {
            toast.success(`Contrato ${paraDesativar.numero} desativado.`);
            setParaDesativar(null);
          } else {
            toast.error(r.erro);
          }
        }}
      />
    </>
  );
}
