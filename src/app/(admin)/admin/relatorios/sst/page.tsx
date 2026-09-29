import type { Metadata } from "next";

import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaRelatorio } from "../tela-relatorio";

export const metadata: Metadata = { title: "Conformidade de SST · Relatórios · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "relatorios", acao: "ver", tambem: [{ modulo: "sst", acao: "ver" }] },
  async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    return <TelaRelatorio chave="sst" searchParams={searchParams} />;
  },
);
