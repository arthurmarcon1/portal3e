import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirUsuario, rotaInicial } from "@/lib/auth/sessao";

import { FormularioTrocaDeSenha } from "./formulario-troca-de-senha";

export const metadata: Metadata = { title: "Primeiro acesso · Portal 3e" };

export default async function PaginaPrimeiroAcesso() {
  const usuario = await exigirUsuario();

  // O proxy já trata o caso, mas a tela confere de novo: quem chega aqui com a
  // senha em dia não fica preso numa troca que não precisa fazer.
  if (!usuario.precisaTrocarSenha) redirect(rotaInicial(usuario.tipo));

  return (
    <Card className="p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Crie sua senha</CardTitle>
        <CardDescription className="text-base text-texto-suave">
          {usuario.nome.split(" ")[0]}, a senha que você recebeu é provisória. Escolha
          uma senha só sua para continuar.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <FormularioTrocaDeSenha />
      </CardContent>
    </Card>
  );
}
