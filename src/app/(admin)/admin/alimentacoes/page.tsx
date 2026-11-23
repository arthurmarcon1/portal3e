import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ImageIcon, Mic } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { listarAlimentacoes, contratosParaEnvio } from "@/features/alimentacoes/queries";
import { transcricaoDisponivel } from "@/features/alimentacoes/transcricao";
import { formatarDataHora } from "@/features/documentos/formato";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { FormularioEnvio } from "./formulario-envio";

export const metadata: Metadata = { title: "Alimentações · Portal 3e" };

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * 3e Conecta — a fila de alimentações (prova de conceito, 0029).
 *
 * O que o produtor mandou entra aqui como pendente, com a sugestão das regras
 * ao lado; a conferência acontece na página de cada uma. Pendentes primeiro.
 */
export default paginaProtegida(
  { tipo: "interno", modulo: "alimentacoes", acao: "ver" },
  async function PaginaAlimentacoes() {
    const [alimentacoes, podeEnviar] = await Promise.all([
      listarAlimentacoes(),
      temPermissao("alimentacoes", "criar"),
    ]);
    const contratos = podeEnviar ? await contratosParaEnvio() : [];
    const ordenadas = [...alimentacoes].sort(
      (a, b) => Number(b.status === "pendente") - Number(a.status === "pendente"),
    );

    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <h1 className="mb-1 text-xl font-semibold">Alimentações</h1>
        <p className="mb-6 text-sm text-texto-suave">
          Áudios e fotos que o produtor mandou. Confira a sugestão antes de virar lançamento.
        </p>

        {podeEnviar ? (
          <FormularioEnvio contratos={contratos} transcricaoAutomatica={transcricaoDisponivel()} />
        ) : null}

        <section aria-labelledby="fila" className="mt-6">
          <h2 id="fila" className="mb-3 text-base font-semibold">
            Recebidas
          </h2>
          {ordenadas.length === 0 ? (
            <div className="superficie px-4 py-10 text-center">
              <p className="font-medium">Nenhuma alimentação ainda.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">
                Envie o áudio ou a foto que o produtor mandou. Ela aparece aqui para conferência.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-borda superficie">
              {ordenadas.map((a) => {
                const Icone = a.tipo === "audio" ? Mic : ImageIcon;
                const valor = a.extracao?.valor;
                return (
                  <li key={a.id}>
                    <Link
                      href={`/admin/alimentacoes/${a.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-fundo-hover"
                    >
                      <Icone aria-hidden strokeWidth={1.5} className="size-5 shrink-0 text-texto-suave" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {a.transcricao ?? (a.tipo === "audio" ? "Áudio sem transcrição" : "Foto sem descrição")}
                        </span>
                        <span className="block text-xs text-texto-suave tabular-nums">
                          {a.tipo === "audio" ? "Áudio" : "Foto"} · {a.contrato_numero} ·{" "}
                          {formatarDataHora(a.criado_em)}
                          {typeof valor === "number" ? ` · sugestão ${MOEDA.format(valor)}` : ""}
                        </span>
                      </span>
                      <BadgeStatus status={a.status} />
                      <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 shrink-0 text-texto-suave" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    );
  },
);
