import type { Metadata } from "next";

import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaRelatorio } from "../tela-relatorio";

export const metadata: Metadata = { title: "Quadro alocado · Relatórios · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "relatorios", acao: "ver", tambem: [{ modulo: "pessoas", acao: "ver" }] },
  async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    return <TelaRelatorio chave="quadro" searchParams={searchParams} />;
  },
);
