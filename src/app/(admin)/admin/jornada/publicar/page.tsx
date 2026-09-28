import type { Metadata } from "next";

import { contratosParaAlocacao } from "@/features/pessoas/queries";
import { regraDaOrganizacao } from "@/features/jornada/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaPublicacaoEspelhos } from "./tela-publicacao";

export const metadata: Metadata = { title: "Publicar espelhos · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "jornada", acao: "criar" },
  async function PaginaPublicarEspelhos() {
    const [regra, contratos, podeEditarRegra] = await Promise.all([
      regraDaOrganizacao(),
      contratosParaAlocacao(),
      temPermissao("jornada", "editar"),
    ]);

    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl">Publicar espelhos</h1>
        <p className="mb-5 text-sm text-texto-suave">
          Envie os PDFs do fechamento (ou um ZIP com eles). Cada arquivo é casado com a pessoa pelo
          CPF ou pela matrícula no nome. Nada é publicado antes de você conferir quem ficou de fora.
        </p>
        <TelaPublicacaoEspelhos
          regraInicial={regra}
          contratos={contratos.map((c) => ({ id: c.id, nome: `${c.numero} · ${c.contratante_nome}` }))}
          podeEditarRegra={podeEditarRegra}
        />
      </main>
    );
  },
);
