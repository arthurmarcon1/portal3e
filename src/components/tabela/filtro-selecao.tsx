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
 * Filtro de listagem por um valor de lista — contrato, unidade, função.
 *
 * Mesma altura e mesmo desenho do `FiltroSituacao`, para a barra de filtros
 * ficar alinhada. O valor vazio é sempre "todos": a tela abre mostrando tudo
 * que o escopo alcança, e o filtro só estreita.
 */
export const TODOS = "";

export function FiltroSelecao({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  rotuloTodos = "Todos",
  largura = "w-48",
}: {
  rotulo: string;
  opcoes: { id: string; nome: string }[];
  valor: string;
  aoMudar: (v: string) => void;
  rotuloTodos?: string;
  largura?: string;
}) {
  const id = useId();

  // O Radix Select reserva a string vazia para "sem seleção", então o item
  // "Todos" precisa de um valor próprio. A conversão fica contida aqui.
  const MARCA_TODOS = "__todos__";

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-texto-suave">
        {rotulo}
      </Label>
      <Select
        value={valor === TODOS ? MARCA_TODOS : valor}
        onValueChange={(v) => aoMudar(v === MARCA_TODOS ? TODOS : v)}
      >
        <SelectTrigger id={id} className={`h-9 ${largura}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MARCA_TODOS}>{rotuloTodos}</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
