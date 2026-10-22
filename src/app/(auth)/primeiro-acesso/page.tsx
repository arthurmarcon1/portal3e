import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ATENDIMENTO } from "@/features/funcionario/textos";
import { exigirUsuario, rotaInicial } from "@/lib/auth/sessao";

import { FormularioTrocaDeSenha } from "./formulario-troca-de-senha";

export const metadata: Metadata = { title: "Primeiro acesso · Portal 3e" };

export default async function PaginaPrimeiroAcesso() {
  const usuario = await exigirUsuario();

  // O proxy já trata o caso, mas a tela confere de novo: quem chega aqui com a
  // senha em dia não fica preso numa troca que não precisa fazer.
  if (!usuario.precisaTrocarSenha) redirect(rotaInicial(usuario.tipo));

  const primeiroNome = usuario.nome.split(" ")[0];

  // Funcionário pode nunca ter usado um portal: antes da senha, o que é isto
  // e o que ele vai encontrar aqui (docs/04). A equipe e o cliente já sabem.
  if (usuario.tipo === "funcionario") {
    return (
      <Card className="p-6">
        <CardHeader className="px-0">
          <CardTitle className="text-xl">Boas-vindas ao Portal 3e, {primeiroNome}</CardTitle>
          <div className="grid gap-2 text-base">
            <p>
              Aqui você recebe seus documentos da 3e: o espelho de ponto todo mês e os comunicados.
              Também é por aqui que você faz pedidos para {ATENDIMENTO.contato}, como férias e
              correção de ponto.
            </p>
            <p>Você continua batendo o ponto como sempre. Aqui você só confere o resumo do mês.</p>
            <p className="mt-2 font-medium">
              Primeiro, crie uma senha só sua. Depois disso, você entra sempre com seu CPF e essa
              senha.
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <FormularioTrocaDeSenha />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Crie sua senha</CardTitle>
        <CardDescription className="text-base text-texto-suave">
          {primeiroNome}, a senha que você recebeu é provisória. Escolha
          uma senha só sua para continuar.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <FormularioTrocaDeSenha />
      </CardContent>
    </Card>
  );
}
