import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { FormularioRecuperacao } from "./formulario-recuperacao";

export const metadata: Metadata = { title: "Recuperar senha · Portal 3e" };

export default function PaginaRecuperarSenha() {
  return (
    <Card className="p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Recuperar senha</CardTitle>
        <CardDescription className="text-base text-texto-suave">
          Enviamos um código de 6 dígitos para o e-mail cadastrado. Com ele você
          escolhe uma senha nova.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 px-0">
        <FormularioRecuperacao />
        <p className="text-sm text-texto-suave">
          Sem e-mail cadastrado? Fale com o RH da 3e ou com seu supervisor na unidade —
          eles geram uma senha provisória nova.
        </p>
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
