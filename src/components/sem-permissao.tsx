import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ROTULOS_ACAO, ROTULOS_MODULO, type Acao, type Modulo } from "@/lib/auth/modulos";
import { rotaInicial, type TipoUsuario } from "@/lib/auth/rotas";

/**
 * Tela de acesso negado por falta de permissão de módulo.
 *
 * Existe para que autorização nunca apareça como erro 500: 500 é defeito.
 * Quem cai aqui tem sessão válida e está na área certa — só não tem a
 * permissão que a tela pede. Então a tela diz exatamente qual permissão
 * falta e a quem pedir, com o código `modulo:acao` que quem administra
 * procura na grade de perfis.
 *
 * Renderizada por `paginaProtegida`, nunca montada à mão.
 */

const A_QUEM_PEDIR: Record<TipoUsuario, string> = {
  // docs/02: só o Admin geral tem administracao:criar/editar.
  interno:
    "o Administrador geral do Portal. Ele libera permissões em Acessos › Perfis e permissões, ou incluindo um perfil no seu acesso.",
  contratante: "o seu contato na 3e, que encaminha o pedido ao administrador do Portal.",
  funcionario: "o RH da 3e.",
};

export function SemPermissao({
  tipo,
  emailLogin,
  modulo,
  acao,
}: {
  tipo: TipoUsuario;
  emailLogin: string;
  modulo: Modulo;
  acao: Acao;
}) {
  const nomeModulo = ROTULOS_MODULO[modulo];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="rounded-lg border border-borda bg-fundo-alt px-5 py-6">
        <h1 className="text-xl">Você não tem acesso a {nomeModulo}</h1>
        <p className="mt-2 text-texto-suave">
          Esta tela exige a permissão{" "}
          <strong className="font-medium text-texto">
            {ROTULOS_ACAO[acao]} em {nomeModulo}
          </strong>
          , e nenhum dos perfis do seu acesso a inclui.
        </p>

        <p className="mt-4">Para pedir acesso, fale com {A_QUEM_PEDIR[tipo]}</p>

        <dl className="mt-3 grid gap-1 rounded-md border border-borda bg-fundo px-3 py-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-texto-suave">Informe o seu acesso</dt>
          <dd className="break-all">{emailLogin}</dd>
          <dt className="text-texto-suave">E a permissão</dt>
          <dd className="font-mono">
            {modulo}:{acao}
          </dd>
        </dl>

        <Button asChild className="mt-5">
          <Link href={rotaInicial(tipo)}>Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
}
