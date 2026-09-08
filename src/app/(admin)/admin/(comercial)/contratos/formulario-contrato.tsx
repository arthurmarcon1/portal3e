"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { CampoSelecao } from "@/components/campo-selecao";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarContrato, editarContrato } from "@/features/contratos/actions";
import type { Contrato, Opcao } from "@/features/contratos/queries";
import { esquemaContrato, type EntradaContrato } from "@/features/contratos/schemas";

export function FormularioContrato({
  alvo,
  contratantes,
  unidadesPorContratante,
  aoFechar,
}: {
  alvo: Contrato | "novo" | null;
  contratantes: Opcao[];
  unidadesPorContratante: Record<string, Opcao[]>;
  aoFechar: () => void;
}) {
  const editando = alvo !== null && alvo !== "novo" ? alvo : null;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EntradaContrato>({
    resolver: zodResolver(esquemaContrato),
    defaultValues: {
      contratante_id: "",
      numero: "",
      descricao: "",
      vigencia_inicio: "",
      vigencia_fim: "",
      unidades: [],
    },
  });

  const contratanteId = useWatch({ control, name: "contratante_id" });
  const selecionadas = useWatch({ control, name: "unidades" }) ?? [];

  // Só as unidades do contratante escolhido: vincular unidade de um cliente ao
  // contrato de outro não faz sentido, e a policy da migração 0005 recusaria.
  const disponiveis = contratanteId ? (unidadesPorContratante[contratanteId] ?? []) : [];

  useEffect(() => {
    if (alvo === null) return;
    reset({
      contratante_id: editando?.contratante_id ?? "",
      numero: editando?.numero ?? "",
      descricao: editando?.descricao ?? "",
      vigencia_inicio: editando?.vigencia_inicio ?? "",
      vigencia_fim: editando?.vigencia_fim ?? "",
      unidades: editando?.unidades.map((u) => u.id) ?? [],
    });
  }, [alvo, editando, reset]);

  async function enviar(dados: EntradaContrato) {
    const resultado = editando
      ? await editarContrato({ ...dados, id: editando.id })
      : await criarContrato(dados);

    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Contrato atualizado." : "Contrato cadastrado.");
    aoFechar();
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(enviar)} noValidate>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar contrato" : "Novo contrato"}</DialogTitle>
            <DialogDescription>
              O instrumento comercial com a contratante. As unidades marcadas aqui são
              as que o contrato atende.
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
                  aoMudar={(v) => {
                    field.onChange(v);
                    // Trocar de contratante invalida as unidades marcadas.
                    setValue("unidades", []);
                  }}
                  erro={errors.contratante_id?.message}
                />
              )}
            />

            <CampoTexto
              rotulo="Número"
              erro={errors.numero?.message}
              {...register("numero")}
            />

            <div className="grid grid-cols-2 gap-2">
              <CampoTexto
                rotulo="Início da vigência"
                type="date"
                erro={errors.vigencia_inicio?.message}
                {...register("vigencia_inicio")}
              />
              <CampoTexto
                rotulo="Fim da vigência"
                type="date"
                erro={errors.vigencia_fim?.message}
                {...register("vigencia_fim")}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                rows={2}
                className="text-base md:text-base"
                {...register("descricao")}
              />
              <p aria-live="polite" className="min-h-5 text-sm text-erro">
                {errors.descricao?.message}
              </p>
            </div>

            <fieldset className="grid gap-2 rounded-lg border border-borda p-3">
              <legend className="px-1 text-sm font-medium">Unidades atendidas</legend>
              {!contratanteId ? (
                <p className="text-sm text-texto-suave">
                  Escolha o contratante para ver as unidades dele.
                </p>
              ) : disponiveis.length === 0 ? (
                <p className="text-sm text-texto-suave">
                  Este contratante ainda não tem unidade ativa. Cadastre uma em
                  Unidades e volte aqui para vincular.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {disponiveis.map((u) => {
                    const marcada = selecionadas.includes(u.id);
                    return (
                      <li key={u.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`unidade-${u.id}`}
                          checked={marcada}
                          onCheckedChange={(valor) =>
                            setValue(
                              "unidades",
                              valor
                                ? [...selecionadas, u.id]
                                : selecionadas.filter((id) => id !== u.id),
                              { shouldDirty: true },
                            )
                          }
                        />
                        <Label htmlFor={`unidade-${u.id}`} className="font-normal">
                          {u.nome}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
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
