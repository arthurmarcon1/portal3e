import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora } from "@/features/documentos/formato";
import {
  documentosDoFuncionario,
  hojeEmBrasilia,
  pendencias,
} from "@/features/documentos/funcionario";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Início · Portal 3e" };

/** Quantos documentos já resolvidos a home mostra. O resto fica para a lista (F4). */
const ULTIMOS = 5;

/**
 * Início do funcionário (docs/04): **a pendência é a home.**
 *
 * Quem abre o Portal abre porque tem algo para resolver — então o primeiro
 * bloco é cada documento esperando resposta, com o prazo e um botão que leva
 * direto à tela de ciência. Sem pendência, uma linha diz isso e sai do
 * caminho. É o começo do teste cronometrado da Fase 3: do login à ciência em
 * menos de um minuto.
 */
export default paginaProtegida(
  { tipo: "funcionario" },
  async function PaginaInicio(_props, usuario) {
    const documentos = await documentosDoFuncionario();
    const abertas = pendencias(documentos);
    const resolvidos = documentos.filter((d) => !abertas.includes(d)).slice(0, ULTIMOS);
    const hoje = hojeEmBrasilia();

    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-5">
        <h1 className="text-xl">Olá, {usuario.nome.split(" ")[0]}</h1>

        {abertas.length === 0 ? (
          <p className="mt-2 text-texto-suave">
            Você não tem nada pendente. Quando a 3e publicar um espelho ou um comunicado para
            você, ele aparece aqui.
          </p>
        ) : (
          <section aria-labelledby="pendencias" className="mt-4 grid gap-3">
            <h2 id="pendencias" className="font-medium">
              {abertas.length === 1 ? "1 pendência" : `${abertas.length} pendências`}
            </h2>
            {abertas.map((d) => {
              const vencido = d.prazo_ciencia !== null && d.prazo_ciencia < hoje;
              return (
                <article key={d.id} className="grid gap-3 rounded-lg border border-borda p-4">
                  <div>
                    <p className="text-sm text-texto-suave">{d.tipo_nome}</p>
                    <h3 className="text-lg leading-snug font-medium">{d.titulo}</h3>
                    {d.prazo_ciencia ? (
                      <p className={cn("mt-1", vencido ? "text-erro" : "text-alerta")}>
                        {vencido
                          ? `Prazo terminou em ${formatarData(d.prazo_ciencia)}`
                          : `Responda até ${formatarData(d.prazo_ciencia)}`}
                      </p>
                    ) : null}
                  </div>
                  <Button asChild className="h-12 w-full text-base">
                    <Link href={`/documentos/${d.id}`}>Ver e confirmar</Link>
                  </Button>
                </article>
              );
            })}
          </section>
        )}

        <Link
          href="/pedidos"
          className="mt-6 flex min-h-14 items-center justify-between rounded-lg border border-borda px-3"
        >
          <span>
            <span className="block font-medium">Meus pedidos</span>
            <span className="block text-sm text-texto-suave">Férias, afastamento, correção de ponto…</span>
          </span>
          <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 text-texto-suave" />
        </Link>

        {resolvidos.length > 0 ? (
          <section aria-labelledby="ultimos" className="mt-8">
            <h2 id="ultimos" className="mb-2 font-medium">
              Últimos documentos
            </h2>
            <ul className="divide-y divide-borda rounded-lg border border-borda">
              {resolvidos.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/documentos/${d.id}`}
                    className="flex min-h-14 items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="line-clamp-2 block">{d.titulo}</span>
                      <span className="block text-sm text-texto-suave">
                        {d.tipo_nome}
                        {d.publicado_em ? ` · ${formatarDataHora(d.publicado_em).slice(0, 10)}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {d.resposta ? <BadgeStatus status={d.resposta.tipo} /> : null}
                      <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 text-texto-suave" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    );
  },
);
