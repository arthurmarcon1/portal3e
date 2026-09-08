"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Input com rótulo de verdade, dica e mensagem de erro ligada ao campo.
 *
 * docs/04 (acessibilidade): placeholder não é rótulo, o erro é anunciado com
 * `aria-live` e o alvo de toque tem 44px de altura.
 */
export function CampoTexto({
  rotulo,
  erro,
  dica,
  id,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  rotulo: string;
  erro?: string;
  dica?: string;
}) {
  const gerado = React.useId();
  const idCampo = id ?? gerado;
  const idDica = dica ? `${idCampo}-dica` : undefined;
  const idErro = `${idCampo}-erro`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={idCampo}>{rotulo}</Label>
      {dica ? (
        <p id={idDica} className="text-sm text-texto-suave">
          {dica}
        </p>
      ) : null}
      <Input
        id={idCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[idDica, erro ? idErro : undefined].filter(Boolean).join(" ") || undefined}
        className={cn("h-11 text-base md:text-base", className)}
        {...props}
      />
      <p id={idErro} aria-live="polite" className="min-h-5 text-sm text-erro">
        {erro}
      </p>
    </div>
  );
}
