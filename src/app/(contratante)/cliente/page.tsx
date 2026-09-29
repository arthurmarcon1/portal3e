import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { BarraProgresso } from "@/components/barra-progresso";
import {
  pendenciasDeCiencia,
  quadroDoContratante,
  solicitacoesAbertas,
  type PendenciaDeCiencia,
} from "@/features/contratante/queries";
import { situacaoPorUnidade, totalDePessoas, type PessoaDoQuadro } from "@/features/contratante/quadro";
import { formatarData } from "@/features/documentos/formato";
import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

export const metadata: Metadata = { title: "Painel do cliente · Portal 3e" };

/**
 * Painel do contratante (F5.1). Cada bloco aparece conforme o módulo do
 * perfil; o dado vem recortado pelo banco (0023) — o painel não filtra nada
 * por conta própria.
 */
export default paginaProtegida(
  { tipo: "contratante" },
  async function PaginaContratante(_props, usuario) {
    const [vePessoas, veDocumentos, veSolicitacoes] = await Promise.all([
      temPermissao("pessoas", "ver"),
      temPermissao("documentos", "ver"),
      temPermissao("solicitacoes", "ver"),
    ]);
    const [quadro, pendencias, abertas] = await Promise.all([
      vePessoas ? quadroDoContratante() : null,
      veDocumentos ? pendenciasDeCiencia() : null,
      veSolicitacoes ? solicitacoesAbertas(usuario.id) : null,
    ]);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="text-xl">Painel</h1>
        <p className="mt-1 text-sm text-texto-suave">Os contratos e unidades sob a sua responsabilidade.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {quadro ? (
            <Numero href="/cliente/pessoas" rotulo="Pessoas alocadas" valor={totalDePessoas(quadro)} />
          ) : null}
          {pendencias ? (
            <Numero
              rotulo="Confirmações pendentes"
              valor={pendencias.reduce((soma, p) => soma + p.pendentes, 0)}
              detalhe={pendencias.length === 1 ? "em 1 documento" : `em ${pendencias.length} documentos`}
            />
          ) : null}
          {abertas ? (
            <Numero
              href="/cliente/solicitacoes"
              rotulo="Solicitações abertas"
              valor={abertas.total}
              detalhe={abertas.aguardandoVoce > 0 ? `${abertas.aguardandoVoce} aguardando você` : undefined}
            />
          ) : null}
        </div>

        {quadro ? <SituacaoPorUnidade quadro={quadro} /> : null}
        {pendencias ? <Pendencias pendencias={pendencias} /> : null}
      </main>
    );
  },
);

function Numero({ rotulo, valor, detalhe, href }: { rotulo: string; valor: number; detalhe?: string; href?: string }) {
  const corpo = (
    <>
      <span className="block text-sm text-texto-suave">{rotulo}</span>
      <span className="mt-1 block text-2xl tabular-nums">{valor}</span>
      {detalhe ? <span className="block text-sm text-texto-suave">{detalhe}</span> : null}
    </>
  );
  if (!href) return <div className="rounded-lg border border-borda px-4 py-3">{corpo}</div>;
  return (
    <Link href={href} className="flex items-center justify-between rounded-lg border border-borda px-4 py-3 hover:bg-fundo-alt">
      <span>{corpo}</span>
      <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 text-texto-suave" />
    </Link>
  );
}

function SituacaoPorUnidade({ quadro }: { quadro: PessoaDoQuadro[] }) {
  const linhas = situacaoPorUnidade(quadro);
  return (
    <section className="mt-8">
      <h2 className="text-lg">Situação do quadro por unidade</h2>
      <p className="mt-1 text-sm text-texto-suave">
        Hoje. Dias trabalhados e faltas vêm do espelho de ponto, que ainda não é consolidado aqui.
      </p>
      {linhas.length === 0 ? (
        <p className="mt-3 text-texto-suave">Nenhuma pessoa alocada nos seus contratos.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-borda">
          <table className="w-full text-sm">
            <thead className="bg-fundo-alt text-left text-texto-suave">
              <tr>
                <th className="px-3 py-2 font-normal">Unidade</th>
                <th className="px-3 py-2 font-normal">Contrato</th>
                <th className="px-3 py-2 text-right font-normal">Alocados</th>
                <th className="px-3 py-2 text-right font-normal">Em atividade</th>
                <th className="px-3 py-2 text-right font-normal">Férias</th>
                <th className="px-3 py-2 text-right font-normal">Afastados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda tabular-nums">
              {linhas.map((l) => (
                <tr key={`${l.contrato_numero}:${l.unidade_id}`}>
                  <td className="px-3 py-2">{l.unidade_nome}</td>
                  <td className="px-3 py-2">{l.contrato_numero}</td>
                  <td className="px-3 py-2 text-right">{l.alocados}</td>
                  <td className="px-3 py-2 text-right">{l.ativa}</td>
                  <td className="px-3 py-2 text-right">{l.ferias}</td>
                  <td className="px-3 py-2 text-right">{l.afastado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Pendencias({ pendencias }: { pendencias: PendenciaDeCiencia[] }) {
  const hoje = hojeEmBrasilia();
  return (
    <section className="mt-8">
      <h2 className="text-lg">Pendências de ciência</h2>
      <p className="mt-1 text-sm text-texto-suave">
        Comunicados, normas e treinamentos que ainda têm alguém do seu quadro sem confirmar.
      </p>
      {pendencias.length === 0 ? (
        <p className="mt-3 text-texto-suave">Ninguém do seu quadro com confirmação pendente.</p>
      ) : (
        <ul className="mt-3 divide-y divide-borda rounded-lg border border-borda">
          {pendencias.map((p) => (
            <li key={p.documento_id} className="grid gap-2 px-4 py-3">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="block font-medium">{p.titulo}</span>
                  <span className="block text-sm text-texto-suave tabular-nums">
                    {p.tipo_nome}
                    {p.prazo_ciencia ? ` · prazo ${formatarData(p.prazo_ciencia)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm tabular-nums">
                  {p.pendentes} {p.pendentes === 1 ? "pendente" : "pendentes"}
                  {p.prazo_ciencia && p.prazo_ciencia < hoje ? <BadgeStatus status="vencido" /> : null}
                </span>
              </span>
              <BarraProgresso parte={p.respondidos} total={p.alcancados} rotulo={`${p.titulo}: responderam`} />
              {/* `respondidos` conta confirmação e divergência — por isso "responderam", não "confirmaram". */}
              <span className="text-sm text-texto-suave tabular-nums">
                {p.respondidos} de {p.alcancados} responderam
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
