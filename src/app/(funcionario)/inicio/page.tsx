import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ClipboardList, MessageSquarePlus } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora } from "@/features/documentos/formato";
import {
  documentosDoFuncionario,
  hojeEmBrasilia,
  pendencias,
} from "@/features/documentos/funcionario";
import { plural } from "@/features/inicio/saudacao";
import { encerrada } from "@/features/solicitacoes/fluxo";
import { listarSolicitacoes } from "@/features/solicitacoes/queries";
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
 *
 * A linha de situação ("12 de 14 documentos respondidos") **informa, não
 * premia** (docs/04, "A ciência nunca é incentivada"): sem elogio, sem selo,
 * sem pressa — só o número. Depois das pendências, os atalhos grandes para
 * os pedidos, com o que está esperando a pessoa.
 */
export default paginaProtegida(
  { tipo: "funcionario" },
  async function PaginaInicio(_props, usuario) {
    const [documentos, pedidos] = await Promise.all([documentosDoFuncionario(), listarSolicitacoes()]);
    const abertas = pendencias(documentos);
    const pedemCiencia = documentos.filter((d) => d.exige_ciencia).length;
    const emAndamento = pedidos.filter((p) => !encerrada(p.status)).length;
    const aguardandoVoce = pedidos.filter((p) => p.status === "pendente_solicitante").length;
    const resolvidos = documentos.filter((d) => !abertas.includes(d)).slice(0, ULTIMOS);
    const hoje = hojeEmBrasilia();

    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-5">
        <h1 className="text-xl">Olá, {usuario.nome.split(" ")[0]}</h1>
        {pedemCiencia > 0 ? (
          <p className="mt-1 text-texto-suave tabular-nums">
            {pedemCiencia - abertas.length} de {pedemCiencia}{" "}
            {plural(pedemCiencia, ["documento respondido", "documentos respondidos"])}
          </p>
        ) : null}

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

        <nav aria-label="Atalhos" className="mt-6 grid grid-cols-2 gap-3">
          <Link href="/pedidos/novo" className="flex min-h-24 flex-col justify-between gap-2 rounded-lg border border-borda p-3">
            <MessageSquarePlus aria-hidden strokeWidth={1.5} className="size-6 text-acao" />
            <span>
              <span className="block font-medium">Fazer um pedido</span>
              <span className="block text-sm text-texto-suave">Férias, afastamento, correção de ponto…</span>
            </span>
          </Link>
          <Link href="/pedidos" className="flex min-h-24 flex-col justify-between gap-2 rounded-lg border border-borda p-3">
            <ClipboardList aria-hidden strokeWidth={1.5} className="size-6 text-acao" />
            <span>
              <span className="block font-medium">Meus pedidos</span>
              {aguardandoVoce > 0 ? (
                <span className="block text-sm text-alerta tabular-nums">
                  {aguardandoVoce} esperando você
                </span>
              ) : (
                <span className="block text-sm text-texto-suave tabular-nums">
                  {emAndamento} em andamento
                </span>
              )}
            </span>
          </Link>
        </nav>

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
