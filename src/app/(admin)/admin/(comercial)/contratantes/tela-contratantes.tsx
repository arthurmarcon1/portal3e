"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BadgeStatus } from "@/components/badge-status";
import { DialogoConfirmacao } from "@/components/dialogo-confirmacao";
import { FiltroSituacao, useFiltroSituacao } from "@/components/tabela/filtro-situacao";
import { MenuLinha } from "@/components/menu-linha";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { mudarStatusContratante } from "@/features/contratos/actions";
import type { Contratante } from "@/features/contratos/queries";

import { FormularioContratante } from "./formulario-contratante";

const helper = criarColunas<Contratante>();

export function TelaContratantes({
  dados,
  podeCriar,
  podeEditar,
}: {
  dados: Contratante[];
  podeCriar: boolean;
  podeEditar: boolean;
}) {
  const [emFormulario, setEmFormulario] = useState<Contratante | "novo" | null>(null);
  const [paraDesativar, setParaDesativar] = useState<Contratante | null>(null);
  const { situacao, setSituacao, aplicar } = useFiltroSituacao();

  const visiveis = useMemo(() => aplicar(dados), [aplicar, dados]);

  const colunas = useMemo<ColunaDe<Contratante>[]>(
    () =>
      helper.columns([
        helper.accessor("nome", { header: "Nome" }),
        helper.accessor("cnpj", {
          header: "CNPJ",
          cell: (ctx) => (
            <span className="tabular-nums">{formatarCnpj(ctx.getValue())}</span>
          ),
        }),
        helper.accessor("contratos", {
          header: "Contratos",
          cell: (ctx) => <span className="tabular-nums">{ctx.getValue()}</span>,
        }),
        helper.accessor("unidades", {
          header: "Unidades",
          cell: (ctx) => <span className="tabular-nums">{ctx.getValue()}</span>,
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
                  <DropdownMenuItem onSelect={() => void reativar(linha)}>
                    Reativar
                  </DropdownMenuItem>
                )}
              </MenuLinha>
            );
          },
        }),
      ]) as ColunaDe<Contratante>[],
    [podeEditar],
  );

  async function reativar(linha: Contratante) {
    const r = await mudarStatusContratante({ id: linha.id, status: "ativo" });
    if (r.ok) toast.success(`${linha.nome} reativado.`);
    else toast.error(r.erro);
  }

  return (
    <>
      <TabelaDados
        colunas={colunas}
        dados={visiveis}
        camposDeBusca={(c) => `${c.nome} ${c.cnpj ?? ""}`}
        rotuloBusca="Buscar por nome ou CNPJ"
        substantivo={["contratante", "contratantes"]}
        filtros={<FiltroSituacao valor={situacao} aoMudar={setSituacao} />}
        acao={
          podeCriar ? (
            <Button type="button" onClick={() => setEmFormulario("novo")}>
              <Plus aria-hidden strokeWidth={1.5} />
              Novo contratante
            </Button>
          ) : undefined
        }
        vazio={{
          titulo: "Nenhum contratante cadastrado ainda.",
          descricao:
            "Cadastre a empresa cliente primeiro. Depois dela vêm os contratos e as unidades de alocação.",
        }}
      />

      <FormularioContratante
        alvo={emFormulario}
        aoFechar={() => setEmFormulario(null)}
      />

      <DialogoConfirmacao
        aberto={paraDesativar !== null}
        aoFechar={() => setParaDesativar(null)}
        titulo="Desativar contratante"
        descricao={
          <>
            <strong>{paraDesativar?.nome}</strong> sai das listas e dos combos de
            seleção. Nada é apagado: contratos, unidades e histórico continuam no
            Portal, e você pode reativar quando quiser.
          </>
        }
        rotuloAcao="Desativar contratante"
        aoConfirmar={async () => {
          if (!paraDesativar) return;
          const r = await mudarStatusContratante({
            id: paraDesativar.id,
            status: "inativo",
          });
          if (r.ok) {
            toast.success(`${paraDesativar.nome} desativado.`);
            setParaDesativar(null);
          } else {
            toast.error(r.erro);
          }
        }}
      />
    </>
  );
}

/** 00.000.000/0000-00 — só na exibição; no banco vai sem máscara. */
function formatarCnpj(valor: string | null): string {
  if (!valor) return "—";
  const d = valor.replace(/\D/g, "");
  if (d.length !== 14) return valor;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
