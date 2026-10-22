import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ATENDIMENTO, maiuscula } from "@/features/funcionario/textos";
import { TIPOS_FUNCIONARIO } from "@/features/solicitacoes/fluxo";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { FormularioPedido } from "./formulario-pedido";

export const metadata: Metadata = { title: "Novo pedido · Portal 3e" };

export default paginaProtegida(
  { tipo: "funcionario" },
  async function PaginaNovoPedido({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  // `?tipo=suporte` vem da linha de ajuda: o pedido já abre com Dúvida marcada.
  const { tipo } = await searchParams;
  const tipoInicial = TIPOS_FUNCIONARIO.find((t) => t === tipo) ?? "";

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">
      <Link href="/pedidos" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-texto-suave">
        <ChevronLeft aria-hidden strokeWidth={1.5} className="size-5" />
        Meus pedidos
      </Link>
      <h1 className="text-xl">Fazer um pedido</h1>
      <p className="mt-1 mb-4">
        Conte o que você precisa. {maiuscula(ATENDIMENTO.curto)} recebe, analisa e responde aqui. Você
        acompanha tudo em <strong className="font-medium">Meus pedidos</strong>.
      </p>
      <FormularioPedido tipoInicial={tipoInicial} />
    </main>
  );
  },
);
