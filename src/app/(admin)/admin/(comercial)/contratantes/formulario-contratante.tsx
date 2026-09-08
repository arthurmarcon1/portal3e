"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { criarContratante, editarContratante } from "@/features/contratos/actions";
import { esquemaContratante, type EntradaContratante } from "@/features/contratos/schemas";
import type { Contratante } from "@/features/contratos/queries";

/** Criação e edição no mesmo diálogo: os campos são idênticos. */
export function FormularioContratante({
  alvo,
  aoFechar,
}: {
  alvo: Contratante | "novo" | null;
  aoFechar: () => void;
}) {
  const editando = alvo !== null && alvo !== "novo" ? alvo : null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EntradaContratante>({
    resolver: zodResolver(esquemaContratante),
    defaultValues: { nome: "", cnpj: "" },
  });

  // O diálogo é montado uma vez e reutilizado: sem isto, abrir "editar" depois
  // de "novo" mostraria os valores antigos.
  useEffect(() => {
    if (alvo === null) return;
    reset({ nome: editando?.nome ?? "", cnpj: editando?.cnpj ?? "" });
  }, [alvo, editando, reset]);

  async function enviar(dados: EntradaContratante) {
    const resultado = editando
      ? await editarContratante({ ...dados, id: editando.id })
      : await criarContratante(dados);

    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Contratante atualizado." : "Contratante cadastrado.");
    aoFechar();
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(enviar)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {editando ? "Editar contratante" : "Novo contratante"}
            </DialogTitle>
            <DialogDescription>
              A empresa cliente. Os contratos e as unidades dela são cadastrados
              depois.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            <CampoTexto
              rotulo="Nome"
              autoFocus
              erro={errors.nome?.message}
              {...register("nome")}
            />
            <CampoTexto
              rotulo="CNPJ"
              inputMode="numeric"
              dica="Opcional. 14 dígitos, com ou sem pontuação."
              erro={errors.cnpj?.message}
              {...register("cnpj")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
