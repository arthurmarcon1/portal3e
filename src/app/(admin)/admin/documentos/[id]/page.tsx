import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { dataMaisDias } from "@/features/documentos/arquivo";
import {
  formatarBytes,
  formatarData,
  formatarDataHora,
  ROTULO_ESCOPO,
} from "@/features/documentos/formato";
import { buscarDocumento, type Documento } from "@/features/documentos/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

import { AcoesDocumento } from "./acoes-documento";

export const metadata: Metadata = { title: "Documento · Portal 3e" };

/**
 * Detalhe do documento (F3.1).
 *
 * Rascunho: prévia do arquivo embutida e o botão de publicar — "salvar como
 * rascunho, pré-visualizar e só então publicar". Publicado: quantos o
 * documento alcança e quantos já responderam, e as saídas que restam
 * (arquivar, retificar). Arquivado: só leitura.
 */
export default paginaProtegida(
  { tipo: "interno", modulo: "documentos", acao: "ver" },
  async function PaginaDocumento({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

    const [documento, podeEditar] = await Promise.all([
      buscarDocumento(id),
      temPermissao("documentos", "editar"),
    ]);

    // Inexistente e fora do alcance da RLS dão no mesmo 404.
    if (!documento) notFound();

    const prazoPadrao =
      documento.tipo.exige_ciencia && documento.tipo.prazo_ciencia_dias
        ? dataMaisDias(documento.tipo.prazo_ciencia_dias)
        : null;

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Link
          href="/admin/documentos"
          className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Documentos
        </Link>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl">{documento.titulo}</h1>
              <BadgeStatus status={documento.status} />
            </div>
            <p className="mt-1 text-sm text-texto-suave">
              {documento.tipo.nome} · versão {documento.versao}
            </p>
          </div>
          {podeEditar ? (
            <AcoesDocumento
              documento={{
                id: documento.id,
                titulo: documento.titulo,
                status: documento.status,
                escopo: documento.escopo,
                exigeCiencia: documento.tipo.exige_ciencia,
                substituiVersao: documento.substitui_id ? documento.versao - 1 : null,
              }}
              prazoPadrao={prazoPadrao}
            />
          ) : null}
        </div>

        {documento.status !== "rascunho" && documento.resumo ? (
          <Resumo documento={documento} />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Dados documento={documento} />
          {documento.status === "rascunho" ? <Previa documento={documento} /> : null}
        </div>
      </main>
    );
  },
);

function Resumo({ documento }: { documento: Documento }) {
  const r = documento.resumo!;
  const pendentes = Math.max(0, r.destinatarios - r.confirmadas - r.divergencias);

  return (
    <dl className="mb-6 grid gap-2 rounded-lg border border-borda bg-fundo-alt px-4 py-4 text-sm sm:grid-cols-4">
      <Numero rotulo="Pessoas alcançadas" valor={r.destinatarios} />
      {documento.tipo.exige_ciencia ? (
        <>
          <Numero rotulo="Confirmaram" valor={r.confirmadas} />
          <Numero rotulo="Registraram divergência" valor={r.divergencias} alerta={r.divergencias > 0} />
          <Numero rotulo="Pendentes" valor={pendentes} alerta={pendentes > 0} />
        </>
      ) : (
        <p className="self-center text-texto-suave sm:col-span-3">
          Este tipo não pede ciência: o documento só fica disponível para download.
        </p>
      )}
    </dl>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div>
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd className={cn("text-2xl tabular-nums", alerta && "text-alerta")}>{valor}</dd>
    </div>
  );
}

function Dados({ documento }: { documento: Documento }) {
  return (
    <section className="grid content-start gap-5">
      <dl className="grid gap-3 text-sm">
        <Item rotulo="Para">
          {documento.escopo === "individual" ? (
            (documento.pessoa_nome ?? "Pessoa fora do seu alcance")
          ) : (
            <>
              {ROTULO_ESCOPO.coletivo}
              <ul className="mt-1 list-disc pl-5">
                {documento.publicos.map((p, i) => (
                  <li key={i}>
                    {[
                      p.contrato_numero ? `contrato ${p.contrato_numero}` : null,
                      p.unidade_nome ? `unidade ${p.unidade_nome}` : null,
                      p.funcao ? `função ${p.funcao}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Item>
        {documento.descricao ? <Item rotulo="Descrição">{documento.descricao}</Item> : null}
        <Item rotulo="Ciência">
          {documento.tipo.exige_ciencia
            ? documento.prazo_ciencia
              ? `até ${formatarData(documento.prazo_ciencia)}`
              : `prazo definido ao publicar (padrão: ${documento.tipo.prazo_ciencia_dias} dias corridos)`
            : "não pede ciência"}
        </Item>
        {documento.tipo.exige_2fa ? (
          <Item rotulo="Acesso">exige código de uso único para abrir</Item>
        ) : null}
        <Item rotulo="Publicado">
          {documento.publicado_em
            ? `${formatarDataHora(documento.publicado_em)}${documento.publicado_por_nome ? ` por ${documento.publicado_por_nome}` : ""}`
            : "ainda não"}
        </Item>
        <Item rotulo="Arquivo">
          PDF, {formatarBytes(documento.arquivo_bytes)}
          <span className="mt-1 block font-mono text-xs break-all text-texto-suave">
            sha256 {documento.arquivo_hash}
          </span>
        </Item>
      </dl>

      {documento.versoes.length > 1 ? (
        <section>
          <h2 className="mb-2 text-base font-medium">Versões</h2>
          <ol className="divide-y divide-borda rounded-lg border border-borda text-sm">
            {documento.versoes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2">
                {v.id === documento.id ? (
                  <span className="font-medium">Versão {v.versao} (esta)</span>
                ) : (
                  <Link
                    href={`/admin/documentos/${v.id}`}
                    className="text-acao underline-offset-2 hover:underline"
                  >
                    Versão {v.versao}
                  </Link>
                )}
                <span className="flex items-center gap-2">
                  <span className="text-texto-suave tabular-nums">
                    {formatarDataHora(v.publicado_em)}
                  </span>
                  <BadgeStatus status={v.status} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * O PDF do rascunho, aberto na própria tela. Tipo com código de uso único não
 * abre aqui até a F3.3 existir — rascunho de holerite é holerite.
 */
function Previa({ documento }: { documento: Documento }) {
  if (documento.tipo.exige_2fa) {
    return (
      <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-10 text-center">
        <p className="font-medium">A prévia deste tipo exige código de uso único.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">
          A verificação por código ainda não está disponível no Portal. Até lá, confira o
          arquivo antes de enviá-lo — o hash acima identifica exatamente o que foi guardado.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Prévia do arquivo">
      <iframe
        src={`/api/documentos/${documento.id}/previa`}
        title={`Prévia: ${documento.titulo}`}
        className="h-[70dvh] w-full rounded-lg border border-borda"
      />
      <p className="mt-2 text-sm text-texto-suave">
        É este arquivo que as pessoas vão receber. A abertura da prévia fica registrada na
        auditoria.
      </p>
    </section>
  );
}
