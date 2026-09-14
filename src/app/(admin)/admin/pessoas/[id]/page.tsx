import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { contratosParaAlocacao, buscarPessoa } from "@/features/pessoas/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { formatarCpf } from "@/lib/cpf-cnpj";
import { cn } from "@/lib/utils";

import { AbaAlocacoes } from "./aba-alocacoes";
import { AbaDados } from "./aba-dados";
import { AcoesPessoa } from "./acoes-pessoa";

export const metadata: Metadata = { title: "Ficha da pessoa · Portal 3e" };

/**
 * Ficha da pessoa, em quatro abas (F1.2).
 *
 * As abas são links com `?aba=` em vez de estado no cliente: cada uma tem URL
 * própria, volta no histórico do navegador e é renderizada no servidor. Só as
 * ilhas que abrem diálogo — ações do cabeçalho e alocações — são cliente.
 *
 * Documentos e Solicitações ficam como espaço reservado até a F3 e a F4.
 */

const ABAS = [
  { chave: "dados", rotulo: "Dados" },
  { chave: "alocacoes", rotulo: "Alocações" },
  { chave: "documentos", rotulo: "Documentos" },
  { chave: "solicitacoes", rotulo: "Solicitações" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

function ehAba(valor: string | undefined): valor is Aba {
  return ABAS.some((a) => a.chave === valor);
}

export default async function PaginaFichaPessoa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaBruta } = await searchParams;
  const aba: Aba = ehAba(abaBruta) ? abaBruta : "dados";

  const [pessoa, contratos, podeCriar, podeEditar] = await Promise.all([
    buscarPessoa(id),
    contratosParaAlocacao(),
    temPermissao("pessoas", "criar"),
    temPermissao("pessoas", "editar"),
  ]);

  // Pessoa inexistente e pessoa fora do alcance da RLS dão no mesmo 404 — a
  // tela não confirma a existência de quem este usuário não pode ver.
  if (!pessoa) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <Link
        href="/admin/pessoas"
        className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
      >
        <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
        Pessoas
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl">{pessoa.nome}</h1>
            <BadgeStatus status={pessoa.status} />
          </div>
          <p className="mt-1 text-sm text-texto-suave tabular-nums">
            CPF {formatarCpf(pessoa.cpf)}
            {pessoa.matricula ? ` · matrícula ${pessoa.matricula}` : ""}
          </p>
        </div>
        {podeEditar ? <AcoesPessoa pessoa={pessoa} /> : null}
      </div>

      <nav aria-label="Seções da ficha" className="mb-5 border-b border-borda">
        <ul className="flex gap-1 overflow-x-auto">
          {ABAS.map((item) => {
            const ativa = item.chave === aba;
            return (
              <li key={item.chave}>
                <Link
                  href={`/admin/pessoas/${pessoa.id}?aba=${item.chave}`}
                  aria-current={ativa ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap",
                    ativa
                      ? "border-acao font-medium text-acao"
                      : "border-transparent text-texto-suave hover:text-texto",
                  )}
                >
                  {item.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {aba === "dados" ? <AbaDados pessoa={pessoa} /> : null}

      {aba === "alocacoes" ? (
        <AbaAlocacoes
          pessoaId={pessoa.id}
          alocacoes={pessoa.alocacoes}
          contratos={contratos}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
        />
      ) : null}

      {aba === "documentos" ? (
        <Reservado
          titulo="Os documentos desta pessoa aparecem aqui."
          descricao="Espelhos, comunicados e demais documentos entram com a publicação e a ciência, na Fase 3."
        />
      ) : null}

      {aba === "solicitacoes" ? (
        <Reservado
          titulo="As solicitações desta pessoa aparecem aqui."
          descricao="Férias, afastamento e correção de ponto entram com o módulo de solicitações, na Fase 4."
        />
      ) : null}
    </main>
  );
}

/** Aba que ainda não tem módulo. Diz o que vai aparecer e quando (docs/04). */
function Reservado({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-10 text-center">
      <p className="font-medium">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">{descricao}</p>
    </div>
  );
}
