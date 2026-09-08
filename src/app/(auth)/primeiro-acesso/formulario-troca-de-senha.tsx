"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { trocarSenha } from "@/features/auth/actions";
import {
  esquemaTrocaDeSenha,
  SENHA_MINIMA,
  type EntradaTrocaDeSenha,
} from "@/features/auth/schemas";

export function FormularioTrocaDeSenha() {
  const [erro, setErro] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntradaTrocaDeSenha>({
    resolver: zodResolver(esquemaTrocaDeSenha),
    defaultValues: { senha: "", confirmacao: "" },
  });

  async function aoEnviar(dados: EntradaTrocaDeSenha) {
    setErro(null);
    const resultado = await trocarSenha(dados);
    if (resultado && !resultado.ok) setErro(resultado.erro);
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} noValidate className="grid gap-3">
      <AvisoErro mensagem={erro} />

      <CampoTexto
        rotulo="Nova senha"
        type="password"
        autoComplete="new-password"
        autoFocus
        dica={`Pelo menos ${SENHA_MINIMA} caracteres. Não precisa de símbolo.`}
        erro={errors.senha?.message}
        {...register("senha")}
      />

      <CampoTexto
        rotulo="Repita a nova senha"
        type="password"
        autoComplete="new-password"
        erro={errors.confirmacao?.message}
        {...register("confirmacao")}
      />

      <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? "Salvando…" : "Salvar senha e continuar"}
      </Button>
    </form>
  );
}
