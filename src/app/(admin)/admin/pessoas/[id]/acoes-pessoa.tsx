"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DialogoConfirmacao } from "@/components/dialogo-confirmacao";
import { MenuLinha } from "@/components/menu-linha";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { mudarStatusPessoa } from "@/features/pessoas/actions";
import type { Pessoa } from "@/features/pessoas/queries";

import { FormularioPessoa } from "../formulario-pessoa";

/**
 * Ações do cabeçalho da ficha: editar cadastro e desativar/reativar.
 *
 * Só aparece para quem tem `pessoas:editar` — e a Server Action confere de
 * novo, porque esconder botão não é autorização.
 */
export function AcoesPessoa({ pessoa }: { pessoa: Pessoa }) {
  const [editando, setEditando] = useState(false);
  const [desativando, setDesativando] = useState(false);

  const ativa = pessoa.status === "ativo";

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" onClick={() => setEditando(true)}>
        <Pencil aria-hidden strokeWidth={1.5} />
        Editar cadastro
      </Button>

      <MenuLinha>
        {ativa ? (
          <DropdownMenuItem variant="destructive" onSelect={() => setDesativando(true)}>
            Desativar pessoa
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={async () => {
              const r = await mudarStatusPessoa({ id: pessoa.id, status: "ativo" });
              if (r.ok) toast.success(`${pessoa.nome} reativada no quadro.`);
              else toast.error(r.erro);
            }}
          >
            Reativar pessoa
          </DropdownMenuItem>
        )}
      </MenuLinha>

      <FormularioPessoa
        alvo={editando ? pessoa : null}
        aoFechar={() => setEditando(false)}
      />

      <DialogoConfirmacao
        aberto={desativando}
        aoFechar={() => setDesativando(false)}
        titulo="Desativar pessoa"
        descricao={
          <>
            <strong>{pessoa.nome}</strong> sai das listas do dia a dia. As alocações, os
            documentos e o histórico continuam no Portal — nada é apagado. Encerre as
            alocações vigentes separadamente, com a data de saída.
          </>
        }
        rotuloAcao="Desativar pessoa"
        aoConfirmar={async () => {
          const r = await mudarStatusPessoa({ id: pessoa.id, status: "inativo" });
          if (r.ok) {
            toast.success(`${pessoa.nome} desativada.`);
            setDesativando(false);
          } else {
            toast.error(r.erro);
          }
        }}
      />
    </div>
  );
}
