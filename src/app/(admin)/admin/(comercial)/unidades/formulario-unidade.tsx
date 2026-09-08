"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { CampoSelecao } from "@/components/campo-selecao";
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
import { criarUnidade, editarUnidade } from "@/features/contratos/actions";
import type { Opcao, Unidade } from "@/features/contratos/queries";
import { esquemaUnidade, type EntradaUnidade } from "@/features/contratos/schemas";

export function FormularioUnidade({
  alvo,
  contratantes,
  aoFechar,
}: {
  alvo: Unidade | "novo" | null;
  contratantes: Opcao[];
  aoFechar: () => void;
}) {
  const editando = alvo !== null && alvo !== "novo" ? alvo : null;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EntradaUnidade>({
    resolver: zodResolver(esquemaUnidade),
    defaultValues: { contratante_id: "", nome: "", endereco: "", cidade: "", uf: "" },
  });

  useEffect(() => {
    if (alvo === null) return;
    reset({
      contratante_id: editando?.contratante_id ?? "",
      nome: editando?.nome ?? "",
      endereco: editando?.endereco ?? "",
      cidade: editando?.cidade ?? "",
      uf: editando?.uf ?? "",
    });
  }, [alvo, editando, reset]);

  async function enviar(dados: EntradaUnidade) {
    const resultado = editando
      ? await editarUnidade({ ...dados, id: editando.id })
      : await criarUnidade(dados);

    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Unidade atualizada." : "Unidade cadastrada.");
    aoFechar();
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit(enviar)} noValidate>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar unidade" : "Nova unidade"}</DialogTitle>
            <DialogDescription>
              O local físico onde a pessoa trabalha. O vínculo com o contrato é feito
              na tela de contratos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            <Controller
              control={control}
              name="contratante_id"
              render={({ field }) => (
                <CampoSelecao
                  rotulo="Contratante"
                  opcoes={contratantes}
                  valor={field.value}
                  aoMudar={field.onChange}
                  erro={errors.contratante_id?.message}
                />
              )}
            />
            <CampoTexto rotulo="Nome" erro={errors.nome?.message} {...register("nome")} />
            <CampoTexto
              rotulo="Endereço"
              dica="Opcional."
              erro={errors.endereco?.message}
              {...register("endereco")}
            />
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <CampoTexto
                rotulo="Cidade"
                erro={errors.cidade?.message}
                {...register("cidade")}
              />
              <CampoTexto
                rotulo="UF"
                maxLength={2}
                className="uppercase"
                erro={errors.uf?.message}
                {...register("uf")}
              />
            </div>
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
