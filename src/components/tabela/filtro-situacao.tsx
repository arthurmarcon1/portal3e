"use client";

import { useCallback, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Filtro de situação das listagens.
 *
 * Padrão "ativos": quem abre a tela quer o que está em operação hoje. O
 * inativo continua acessível — nada foi apagado (invariante 8) — mas não
 * polui a lista do dia a dia.
 */
export type FiltroSituacaoValor = "ativos" | "inativos" | "todos";

export function useFiltroSituacao(inicial: FiltroSituacaoValor = "ativos") {
  const [situacao, setSituacao] = useState<FiltroSituacaoValor>(inicial);

  const aplicar = useCallback(
    <T extends { status: string }>(linhas: T[]): T[] => {
      if (situacao === "todos") return linhas;
      if (situacao === "ativos") return linhas.filter((l) => l.status === "ativo");
      return linhas.filter((l) => l.status !== "ativo");
    },
    [situacao],
  );

  return { situacao, setSituacao, aplicar };
}

export function FiltroSituacao({
  valor,
  aoMudar,
}: {
  valor: FiltroSituacaoValor;
  aoMudar: (v: FiltroSituacaoValor) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor="filtro-situacao" className="text-xs text-texto-suave">
        Situação
      </Label>
      <Select value={valor} onValueChange={(v) => aoMudar(v as FiltroSituacaoValor)}>
        <SelectTrigger id="filtro-situacao" className="h-9 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ativos">Ativos</SelectItem>
          <SelectItem value="inativos">Inativos</SelectItem>
          <SelectItem value="todos">Todos</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
