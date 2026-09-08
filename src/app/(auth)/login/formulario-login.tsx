"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { entrar } from "@/features/auth/actions";
import { esquemaLogin, type EntradaLogin } from "@/features/auth/schemas";

export function FormularioLogin({ destino }: { destino?: string }) {
  const [erro, setErro] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntradaLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { identificador: "", senha: "", destino },
  });

  // Em caso de sucesso a Server Action redireciona e esta promessa nunca
  // resolve com valor — só o caminho de erro volta para cá.
  async function aoEnviar(dados: EntradaLogin) {
    setErro(null);
    const resultado = await entrar(dados);
    if (resultado && !resultado.ok) setErro(resultado.erro);
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} noValidate className="grid gap-3">
      <AvisoErro mensagem={erro} />

      <input type="hidden" {...register("destino")} />

      <CampoTexto
        rotulo="CPF ou e-mail"
        autoComplete="username"
        inputMode="text"
        autoFocus
        erro={errors.identificador?.message}
        {...register("identificador")}
      />

      <CampoTexto
        rotulo="Senha"
        type="password"
        autoComplete="current-password"
        erro={errors.senha?.message}
        {...register("senha")}
      />

      <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? "Entrando…" : "Entrar"}
      </Button>

      <Link
        href="/recuperar-senha"
        className="mt-1 justify-self-center rounded-sm px-2 py-2 text-sm text-acao underline underline-offset-4"
      >
        Esqueci minha senha
      </Link>
    </form>
  );
}
