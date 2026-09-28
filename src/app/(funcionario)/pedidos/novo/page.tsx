import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { FormularioPedido } from "./formulario-pedido";

export const metadata: Metadata = { title: "Novo pedido · Portal 3e" };

export default paginaProtegida({ tipo: "funcionario" }, async function PaginaNovoPedido() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">
      <Link href="/pedidos" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-texto-suave">
        <ChevronLeft aria-hidden strokeWidth={1.5} className="size-5" />
        Meus pedidos
      </Link>
      <h1 className="mb-4 text-xl">Fazer um pedido</h1>
      <FormularioPedido />
    </main>
  );
});
