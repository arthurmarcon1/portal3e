import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import {
  listarPerfis,
  listarUsuarios,
  opcoesDeEscopo,
  pessoasSemUsuario,
} from "@/features/acessos/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { Button } from "@/components/ui/button";

import { TelaAcessos } from "./tela-acessos";

export const metadata: Metadata = { title: "Acessos · Portal 3e" };

export default async function PaginaAcessos() {
  const [usuarios, perfis, pessoas, escopo, podeCriar, podeEditar] = await Promise.all([
    listarUsuarios(),
    listarPerfis(),
    pessoasSemUsuario(),
    opcoesDeEscopo(),
    temPermissao("administracao", "criar"),
    temPermissao("administracao", "editar"),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl">Acessos</h1>
          <p className="text-sm text-texto-suave">
            Quem entra no Portal, com que perfil e sobre qual escopo.
          </p>
        </div>
        <Button type="button" variant="outline" asChild>
          <Link href="/admin/acessos/perfis">
            <SlidersHorizontal aria-hidden strokeWidth={1.5} />
            Perfis e permissões
          </Link>
        </Button>
      </div>

      <TelaAcessos
        usuarios={usuarios}
        perfis={perfis}
        pessoasSemUsuario={pessoas}
        opcoesEscopo={escopo}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </main>
  );
}
