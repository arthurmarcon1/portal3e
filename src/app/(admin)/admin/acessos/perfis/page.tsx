import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { listarPerfis } from "@/features/acessos/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaPerfis } from "./tela-perfis";

export const metadata: Metadata = { title: "Perfis e permissões · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "administracao", acao: "ver" },
  async function PaginaPerfis() {
    const [perfis, podeEditar] = await Promise.all([
      listarPerfis(),
      temPermissao("administracao", "editar"),
    ]);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Link
          href="/admin/acessos"
          className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Acessos
        </Link>

        <h1 className="mb-1 text-xl">Perfis e permissões</h1>
        <p className="mb-5 max-w-2xl text-sm text-texto-suave">
          Permissão é dado, não código: marcar uma caixa aqui muda o que o perfil pode
          fazer na hora, sem deploy. Toda alteração vai para a auditoria com o estado
          anterior e o novo.
        </p>

        <TelaPerfis perfis={perfis} podeEditar={podeEditar} />
      </main>
    );
  },
);
