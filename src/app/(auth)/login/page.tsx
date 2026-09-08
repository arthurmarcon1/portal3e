import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar · Portal 3e" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ senha?: string; destino?: string }>;
}) {
  const { senha, destino } = await searchParams;

  return (
    <Card className="p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Entrar no Portal</CardTitle>
        <CardDescription className="text-base text-texto-suave">
          Use seu CPF, se você é funcionário, ou o e-mail cadastrado.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {senha === "redefinida" ? (
          <p className="mb-4 rounded-md border border-sucesso/30 bg-fundo-alt px-3 py-2 text-sm text-sucesso">
            Senha redefinida. Entre com a nova senha.
          </p>
        ) : null}
        <FormularioLogin destino={destino} />
      </CardContent>
    </Card>
  );
}
