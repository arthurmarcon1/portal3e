"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Lista de checkboxes com legenda — perfis, contratos, unidades.
 *
 * Em `fieldset`/`legend` de verdade: é um grupo de controles relacionados, e
 * leitor de tela precisa anunciar o grupo antes de cada item (docs/04).
 */
export function ListaDeMarcacao({
  legenda,
  dica,
  opcoes,
  marcadas,
  aoMudar,
  vazio,
}: {
  legenda: string;
  dica?: string;
  opcoes: { id: string; nome: string }[];
  marcadas: string[];
  aoMudar: (ids: string[]) => void;
  vazio: string;
}) {
  const id = useId();

  function alternar(idOpcao: string, marcada: boolean) {
    aoMudar(marcada ? [...marcadas, idOpcao] : marcadas.filter((v) => v !== idOpcao));
  }

  return (
    <fieldset className="grid gap-2 rounded-lg border border-borda p-3">
      <legend className="px-1 text-sm font-medium">{legenda}</legend>
      {dica ? <p className="text-sm text-texto-suave">{dica}</p> : null}

      {opcoes.length === 0 ? (
        <p className="text-sm text-texto-suave">{vazio}</p>
      ) : (
        <ul className="grid max-h-56 gap-2 overflow-y-auto">
          {opcoes.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${o.id}`}
                checked={marcadas.includes(o.id)}
                onCheckedChange={(v) => alternar(o.id, v === true)}
              />
              <Label htmlFor={`${id}-${o.id}`} className="font-normal">
                {o.nome}
              </Label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
