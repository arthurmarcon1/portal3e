"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Select com rótulo e erro ligado ao campo, no mesmo desenho do CampoTexto.
 *
 * Controlado: use com o `Controller` do react-hook-form. O Radix Select não
 * emite eventos de `<input>`, então `register` não serve aqui.
 */
export function CampoSelecao({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  erro,
  dica,
  placeholder = "Selecione…",
  desabilitado,
}: {
  rotulo: string;
  opcoes: { id: string; nome: string }[];
  valor: string | undefined;
  aoMudar: (v: string) => void;
  erro?: string;
  dica?: string;
  placeholder?: string;
  desabilitado?: boolean;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  const idDica = dica ? `${id}-dica` : undefined;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {dica ? (
        <p id={idDica} className="text-sm text-texto-suave">
          {dica}
        </p>
      ) : null}
      <Select value={valor ?? ""} onValueChange={aoMudar} disabled={desabilitado}>
        <SelectTrigger
          id={id}
          aria-invalid={erro ? true : undefined}
          aria-describedby={[idDica, erro ? idErro : undefined].filter(Boolean).join(" ") || undefined}
          className="h-11 w-full"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={idErro} aria-live="polite" className="min-h-5 text-sm text-erro">
        {erro}
      </p>
    </div>
  );
}
