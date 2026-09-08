"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { pedirCodigo, redefinirSenha } from "@/features/auth/actions";
import {
  esquemaPedidoDeCodigo,
  esquemaRedefinicao,
  SENHA_MINIMA,
  type EntradaPedidoDeCodigo,
  type EntradaRedefinicao,
} from "@/features/auth/schemas";

/** Segundos de espera antes de liberar o reenvio do código. */
const ESPERA_REENVIO = 60;

export function FormularioRecuperacao() {
  const [identificador, setIdentificador] = useState<string | null>(null);

  return identificador === null ? (
    <EtapaPedido aoEnviar={setIdentificador} />
  ) : (
    <EtapaRedefinicao identificador={identificador} aoVoltar={() => setIdentificador(null)} />
  );
}

function EtapaPedido({ aoEnviar }: { aoEnviar: (identificador: string) => void }) {
  const [erro, setErro] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntradaPedidoDeCodigo>({
    resolver: zodResolver(esquemaPedidoDeCodigo),
    defaultValues: { identificador: "" },
  });

  async function enviar(dados: EntradaPedidoDeCodigo) {
    setErro(null);
    const resultado = await pedirCodigo(dados);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    // A resposta é a mesma exista ou não o cadastro: seguimos para o código.
    aoEnviar(dados.identificador);
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="grid gap-3">
      <AvisoErro mensagem={erro} />
      <CampoTexto
        rotulo="CPF ou e-mail"
        autoComplete="username"
        autoFocus
        erro={errors.identificador?.message}
        {...register("identificador")}
      />
      <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? "Enviando…" : "Enviar código"}
      </Button>
    </form>
  );
}

function EtapaRedefinicao({
  identificador,
  aoVoltar,
}: {
  identificador: string;
  aoVoltar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [espera, setEspera] = useState(ESPERA_REENVIO);

  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntradaRedefinicao>({
    resolver: zodResolver(esquemaRedefinicao),
    defaultValues: { identificador, codigo: "", senha: "", confirmacao: "" },
  });

  async function enviar(dados: EntradaRedefinicao) {
    setErro(null);
    const resultado = await redefinirSenha(dados);
    if (resultado && !resultado.ok) setErro(resultado.erro);
  }

  async function reenviar() {
    setReenviando(true);
    setErro(null);
    await pedirCodigo({ identificador });
    setEspera(ESPERA_REENVIO);
    setReenviando(false);
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="grid gap-3">
      <p aria-live="polite" className="text-sm text-texto-suave">
        Se houver um cadastro com esse CPF ou e-mail, o código já foi enviado. Ele vale
        por 10 minutos.
      </p>

      <AvisoErro mensagem={erro} />

      <input type="hidden" {...register("identificador")} />

      <CampoTexto
        rotulo="Código de 6 dígitos"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        className="tabular-nums"
        erro={errors.codigo?.message}
        {...register("codigo")}
      />

      <CampoTexto
        rotulo="Nova senha"
        type="password"
        autoComplete="new-password"
        dica={`Pelo menos ${SENHA_MINIMA} caracteres.`}
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
        {isSubmitting ? "Salvando…" : "Redefinir senha"}
      </Button>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-2"
          onClick={aoVoltar}
        >
          Trocar o CPF ou e-mail
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-2"
          onClick={reenviar}
          disabled={espera > 0 || reenviando}
        >
          {espera > 0 ? `Reenviar em ${espera}s` : "Reenviar código"}
        </Button>
      </div>
    </form>
  );
}
