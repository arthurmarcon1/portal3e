"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { criarAlocacao } from "@/features/pessoas/actions";
import type { ContratoComUnidades } from "@/features/pessoas/queries";
import { esquemaAlocacao, type EntradaAlocacao } from "@/features/pessoas/schemas";

/**
 * Nova alocação: contrato + unidade + função + data de início, os quatro
 * obrigatórios (F1.2).
 *
 * A unidade é escolhida dentro do contrato, por `contrato_unidades` — a mesma
 * amarração que a Server Action reconfere antes de gravar.
 */
export function FormularioAlocacao({
  pessoaId,
  aberto,
  contratos,
  aoFechar,
}: {
  pessoaId: string;
  aberto: boolean;
  contratos: ContratoComUnidades[];
  aoFechar: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EntradaAlocacao>({
    resolver: zodResolver(esquemaAlocacao),
    defaultValues: {
      pessoa_id: pessoaId,
      contrato_id: "",
      unidade_id: "",
      funcao: "",
      data_inicio: "",
    },
  });

  const contratoId = useWatch({ control, name: "contrato_id" });
  const unidades = contratos.find((c) => c.id === contratoId)?.unidades ?? [];

  useEffect(() => {
    if (!aberto) return;
    reset({
      pessoa_id: pessoaId,
      contrato_id: "",
      unidade_id: "",
      funcao: "",
      data_inicio: "",
    });
  }, [aberto, pessoaId, reset]);

  async function enviar(dados: EntradaAlocacao) {
    const resultado = await criarAlocacao(dados);
    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Alocação registrada.");
    aoFechar();
  }

  const semContrato = contratos.length === 0;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(enviar)} noValidate>
          <DialogHeader>
            <DialogTitle>Nova alocação</DialogTitle>
            <DialogDescription>
              Onde a pessoa trabalha, desde quando e em que função. É a alocação que
              define o que o contratante enxerga.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            {semContrato ? (
              <p className="rounded-lg border border-borda bg-fundo-alt px-4 py-6 text-center text-sm text-texto-suave">
                Nenhum contrato ativo com unidade vinculada. Cadastre o contrato e
                vincule as unidades dele em Contratos, depois volte aqui.
              </p>
            ) : (
              <>
                <Controller
                  control={control}
                  name="contrato_id"
                  render={({ field }) => (
                    <CampoSelecao
                      rotulo="Contrato"
                      opcoes={contratos.map((c) => ({
                        id: c.id,
                        nome: `${c.numero} · ${c.contratante_nome}`,
                      }))}
                      valor={field.value}
                      aoMudar={(v) => {
                        field.onChange(v);
                        // Trocar de contrato invalida a unidade escolhida.
                        setValue("unidade_id", "");
                      }}
                      erro={errors.contrato_id?.message}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="unidade_id"
                  render={({ field }) => (
                    <CampoSelecao
                      rotulo="Unidade"
                      opcoes={unidades}
                      valor={field.value}
                      aoMudar={field.onChange}
                      desabilitado={!contratoId}
                      placeholder={
                        !contratoId
                          ? "Escolha o contrato primeiro"
                          : unidades.length === 0
                            ? "Este contrato não tem unidade ativa"
                            : "Selecione…"
                      }
                      erro={errors.unidade_id?.message}
                    />
                  )}
                />

                <CampoTexto
                  rotulo="Função"
                  erro={errors.funcao?.message}
                  {...register("funcao")}
                />

                <CampoTexto
                  rotulo="Data de início"
                  type="date"
                  erro={errors.data_inicio?.message}
                  {...register("data_inicio")}
                />
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || semContrato}>
              {isSubmitting ? "Salvando…" : "Registrar alocação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
