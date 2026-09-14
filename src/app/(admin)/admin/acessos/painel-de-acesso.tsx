"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ListaDeMarcacao } from "@/components/lista-de-marcacao";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  alterarEscopoDoUsuario,
  alterarPerfisDoUsuario,
} from "@/features/acessos/actions";
import type { Perfil, UsuarioAcesso } from "@/features/acessos/queries";

import { AvisoDeEscopo } from "./formulario-usuario";
import type { OpcoesEscopo } from "./tela-acessos";

/**
 * Edição de perfis e escopo de um usuário existente.
 *
 * As duas mudanças são gravadas por Server Actions separadas — e só as que
 * realmente mudaram —, porque cada uma vira uma linha própria em `auditoria`,
 * com antes e depois. Um "salvar tudo" que sempre grava as duas encheria a
 * trilha de eventos onde nada aconteceu, e é justamente a trilha que alguém
 * vai ler quando precisar entender um acesso indevido.
 *
 * Só existe enquanto está aberto, montado pelo pai com `key={usuario.id}`:
 * o estado inicial sai direto do usuário, sem efeito de sincronização.
 */
export function PainelDeAcesso({
  usuario,
  perfis,
  opcoesEscopo,
  aoFechar,
}: {
  usuario: UsuarioAcesso;
  perfis: Perfil[];
  opcoesEscopo: OpcoesEscopo;
  aoFechar: () => void;
}) {
  const [marcados, setMarcados] = useState(() => usuario.perfis.map((p) => p.id));
  const [contratos, setContratos] = useState(() =>
    usuario.escopo.contratos.map((c) => c.id),
  );
  const [unidades, setUnidades] = useState(() =>
    usuario.escopo.unidades.map((u) => u.id),
  );
  const [salvando, setSalvando] = useState(false);

  const perfisDoTipo = perfis.filter((p) => p.aplica_a === usuario.tipo);

  const iguais = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

  const perfisMudaram = !iguais(
    marcados,
    usuario.perfis.map((p) => p.id),
  );
  const escopoMudou =
    !iguais(
      contratos,
      usuario.escopo.contratos.map((c) => c.id),
    ) ||
    !iguais(
      unidades,
      usuario.escopo.unidades.map((u) => u.id),
    );

  async function salvar() {
    setSalvando(true);

    if (perfisMudaram) {
      const r = await alterarPerfisDoUsuario({
        usuario_id: usuario.id,
        perfis: marcados,
      });
      if (!r.ok) {
        toast.error(r.erro);
        setSalvando(false);
        return;
      }
    }

    if (escopoMudou) {
      const r = await alterarEscopoDoUsuario({
        usuario_id: usuario.id,
        escopo: { contratos, unidades },
      });
      if (!r.ok) {
        toast.error(r.erro);
        setSalvando(false);
        return;
      }
    }

    setSalvando(false);
    toast.success(`Acesso de ${usuario.nome} atualizado.`);
    aoFechar();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Perfis e escopo</DialogTitle>
          <DialogDescription>
            {usuario.nome} · {usuario.email_login}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-4">
          <ListaDeMarcacao
            legenda="Perfis"
            dica="O que a pessoa pode fazer. Pode ter mais de um."
            opcoes={perfisDoTipo.map((p) => ({ id: p.id, nome: p.nome }))}
            marcadas={marcados}
            aoMudar={setMarcados}
            vazio="Nenhum perfil cadastrado para este tipo de usuário."
          />

          <ListaDeMarcacao
            legenda="Contratos do escopo"
            opcoes={opcoesEscopo.contratos}
            marcadas={contratos}
            aoMudar={setContratos}
            vazio="Nenhum contrato ativo."
          />

          <ListaDeMarcacao
            legenda="Unidades do escopo"
            opcoes={opcoesEscopo.unidades}
            marcadas={unidades}
            aoMudar={setUnidades}
            vazio="Nenhuma unidade ativa."
          />

          <AvisoDeEscopo
            tipo={usuario.tipo}
            vazio={contratos.length === 0 && unidades.length === 0}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={salvando || (!perfisMudaram && !escopoMudou)}
          >
            {salvando ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
