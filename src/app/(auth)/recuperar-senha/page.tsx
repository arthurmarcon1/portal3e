import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RECUPERACAO_INDISPONIVEL } from "@/features/auth/schemas";
import { emailAtivo } from "@/lib/email";

import { FormularioRecuperacao } from "./formulario-recuperacao";

export const metadata: Metadata = { title: "Recuperar senha · Portal 3e" };

/**
 * Recuperação de senha por código de e-mail.
 *
 * Sem e-mail ligado nesta instalação (`emailAtivo()`, a mesma regra da fila
 * de avisos), a tela **não pede nada**: diz que a recuperação por conta
 * própria está indisponível e que quem redefine são os administradores do
 * Portal — sem citar setor nem pessoa. Pedir o CPF para
 * depois não entregar código é pior que não ter a função — a pessoa espera um
 * e-mail que não vem (docs/06, 2026-10-01). Ligou o e-mail, a tela volta ao
 * normal sem mudança de código.
 *
 * `connection()`: a decisão é do ambiente em que a página roda, não do
 * momento do build.
 */
export default async function PaginaRecuperarSenha() {
  await connection();
  const disponivel = emailAtivo();

  return (
    <Card className="p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Recuperar senha</CardTitle>
        <CardDescription className="text-base text-texto-suave">
          {disponivel
            ? "Enviamos um código de 6 dígitos para o e-mail cadastrado. Com ele você escolhe uma senha nova."
            : RECUPERACAO_INDISPONIVEL}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 px-0">
        {disponivel && (
          <>
            <FormularioRecuperacao />
            <p className="text-sm text-texto-suave">
              Sem e-mail cadastrado? Peça aos administradores do Portal uma senha
              provisória nova.
            </p>
          </>
        )}
        <Link
          href="/login"
          className="justify-self-center rounded-sm px-2 py-2 text-sm text-acao underline underline-offset-4"
        >
          Voltar para entrar
        </Link>
      </CardContent>
    </Card>
  );
}
