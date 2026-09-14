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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarPessoa, editarPessoa } from "@/features/pessoas/actions";
import { esquemaPessoa, type EntradaPessoa } from "@/features/pessoas/schemas";
import { formatarCpf } from "@/lib/cpf-cnpj";

/**
 * Cadastro e edição da pessoa.
 *
 * O CPF é exibido com máscara e gravado só com dígitos — a conversão está no
 * próprio esquema Zod, então vale igual aqui e na Server Action.
 */

/** Dados que a ficha passa ao abrir em modo de edição. */
export type PessoaEditavel = {
  id: string;
  nome: string;
  cpf: string;
  matricula: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  email_pessoal: string | null;
  endereco: string | null;
};

const VAZIO: EntradaPessoa = {
  nome: "",
  cpf: "",
  matricula: "",
  data_nascimento: "",
  telefone: "",
  email_pessoal: "",
  endereco: "",
};

export function FormularioPessoa({
  alvo,
  aoFechar,
  aoCriar,
}: {
  alvo: PessoaEditavel | "nova" | null;
  aoFechar: () => void;
  /** Chamado com o id da pessoa recém-criada, para quem quiser abrir a ficha. */
  aoCriar?: (id: string) => void;
}) {
  const editando = alvo !== null && alvo !== "nova" ? alvo : null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EntradaPessoa>({
    resolver: zodResolver(esquemaPessoa),
    defaultValues: VAZIO,
  });

  useEffect(() => {
    if (alvo === null) return;
    reset(
      editando
        ? {
            nome: editando.nome,
            cpf: formatarCpf(editando.cpf),
            matricula: editando.matricula ?? "",
            data_nascimento: editando.data_nascimento ?? "",
            telefone: editando.telefone ?? "",
            email_pessoal: editando.email_pessoal ?? "",
            endereco: editando.endereco ?? "",
          }
        : VAZIO,
    );
  }, [alvo, editando, reset]);

  async function enviar(dados: EntradaPessoa) {
    if (editando) {
      const resultado = await editarPessoa({ ...dados, id: editando.id });
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Cadastro atualizado.");
      aoFechar();
      return;
    }

    const resultado = await criarPessoa(dados);
    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Pessoa cadastrada.");
    aoFechar();
    aoCriar?.(resultado.dados.id);
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(enviar)} noValidate>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar cadastro" : "Nova pessoa"}</DialogTitle>
            <DialogDescription>
              O cadastro identifica a pessoa. Onde ela trabalha é a alocação, registrada
              na ficha.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 py-4">
            <CampoTexto rotulo="Nome completo" erro={errors.nome?.message} {...register("nome")} />

            <div className="grid grid-cols-2 gap-2">
              <CampoTexto
                rotulo="CPF"
                inputMode="numeric"
                placeholder="000.000.000-00"
                dica={editando ? undefined : "É por ele que o funcionário entra no Portal."}
                erro={errors.cpf?.message}
                {...register("cpf")}
              />
              <CampoTexto
                rotulo="Matrícula"
                erro={errors.matricula?.message}
                {...register("matricula")}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <CampoTexto
                rotulo="Data de nascimento"
                type="date"
                erro={errors.data_nascimento?.message}
                {...register("data_nascimento")}
              />
              <CampoTexto
                rotulo="Telefone"
                inputMode="tel"
                erro={errors.telefone?.message}
                {...register("telefone")}
              />
            </div>

            <CampoTexto
              rotulo="E-mail pessoal"
              type="email"
              erro={errors.email_pessoal?.message}
              {...register("email_pessoal")}
            />

            <div className="grid gap-1.5">
              <Label htmlFor="endereco">Endereço</Label>
              <Textarea
                id="endereco"
                rows={2}
                className="text-base md:text-base"
                {...register("endereco")}
              />
              <p aria-live="polite" className="min-h-5 text-sm text-erro">
                {errors.endereco?.message}
              </p>
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
