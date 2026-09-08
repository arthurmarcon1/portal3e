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
import { mudarStatusUnidade } from "@/features/contratos/actions";
import type { Opcao, Unidade } from "@/features/contratos/queries";

import { FormularioUnidade } from "./formulario-unidade";

const helper = criarColunas<Unidade>();

export function TelaUnidades({
  dados,
  contratantes,
  podeCriar,
  podeEditar,
}: {
  dados: Unidade[];
  contratantes: Opcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}) {
  const [emFormulario, setEmFormulario] = useState<Unidade | "novo" | null>(null);
  const [paraDesativar, setParaDesativar] = useState<Unidade | null>(null);
  const { situacao, setSituacao, aplicar } = useFiltroSituacao();

  const visiveis = useMemo(() => aplicar(dados), [aplicar, dados]);

  const colunas = useMemo<ColunaDe<Unidade>[]>(
    () =>
      helper.columns([
        helper.accessor("nome", { header: "Unidade" }),
        helper.accessor("contratante_nome", { header: "Contratante" }),
        helper.display({
          id: "local",
          header: "Cidade/UF",
          cell: (ctx) => {
            const { cidade, uf } = ctx.row.original;
            if (!cidade && !uf) return <span className="text-texto-suave">—</span>;
            return [cidade, uf].filter(Boolean).join(" / ");
          },
        }),
        helper.accessor("contratos", {
          header: "Contratos",
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
                  <DropdownMenuItem
                    onSelect={async () => {
                      const r = await mudarStatusUnidade({
                        id: linha.id,
                        status: "ativo",
                      });
                      if (r.ok) toast.success(`${linha.nome} reativada.`);
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
      ]) as ColunaDe<Unidade>[],
    [podeEditar],
  );

  return (
    <>
      <TabelaDados
        colunas={colunas}
        dados={visiveis}
        camposDeBusca={(u) =>
          `${u.nome} ${u.contratante_nome} ${u.cidade ?? ""} ${u.uf ?? ""}`
        }
        rotuloBusca="Buscar por unidade, contratante ou cidade"
        substantivo={["unidade", "unidades"]}
        filtros={<FiltroSituacao valor={situacao} aoMudar={setSituacao} />}
        acao={
          podeCriar ? (
            <Button
              type="button"
              onClick={() => setEmFormulario("novo")}
              disabled={contratantes.length === 0}
            >
              <Plus aria-hidden strokeWidth={1.5} />
              Nova unidade
            </Button>
          ) : undefined
        }
        vazio={{
          titulo: "Nenhuma unidade cadastrada ainda.",
          descricao:
            contratantes.length === 0
              ? "Cadastre um contratante ativo primeiro — toda unidade pertence a um."
              : "A unidade é o local onde a pessoa trabalha. Depois de criada, vincule-a a um contrato.",
        }}
      />

      <FormularioUnidade
        alvo={emFormulario}
        contratantes={contratantes}
        aoFechar={() => setEmFormulario(null)}
      />

      <DialogoConfirmacao
        aberto={paraDesativar !== null}
        aoFechar={() => setParaDesativar(null)}
        titulo="Desativar unidade"
        descricao={
          <>
            <strong>{paraDesativar?.nome}</strong> deixa de aparecer nas listas e não
            poderá ser vinculada a novos contratos. Os vínculos e as alocações que já
            existem continuam intactos.
          </>
        }
        rotuloAcao="Desativar unidade"
        aoConfirmar={async () => {
          if (!paraDesativar) return;
          const r = await mudarStatusUnidade({ id: paraDesativar.id, status: "inativo" });
          if (r.ok) {
            toast.success(`${paraDesativar.nome} desativada.`);
            setParaDesativar(null);
          } else {
            toast.error(r.erro);
          }
        }}
      />
    </>
  );
}
