"use client";

import {
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataHoraBrasilia } from "@/features/auditoria/csv";
import {
  paginasVisiveis,
  paraQueryString,
  type FiltrosAuditoria,
} from "@/features/auditoria/filtros";
import type { EventoAuditoria } from "@/features/auditoria/queries";
import { rotuloAcao, rotuloEntidade } from "@/features/auditoria/rotulos";
import { cn } from "@/lib/utils";

/**
 * Tabela da trilha.
 *
 * Não usa `TabelaDados`: aquela pagina e busca no navegador, sobre a lista
 * inteira. A trilha é a tabela que mais cresce no schema e é paginada no
 * servidor, 100 por página (F2.2) — então aqui a tabela só desenha a página
 * recebida, e a paginação é numerada, por link.
 */

// Sem ordenação nem paginação no cliente: as duas são do servidor.
const recursos = tableFeatures({});
const helper = createColumnHelper<typeof recursos, EventoAuditoria>();

export function TelaAuditoria({
  eventos,
  total,
  pagina,
  paginas,
  filtros,
}: {
  eventos: EventoAuditoria[];
  total: number;
  pagina: number;
  paginas: number;
  filtros: FiltrosAuditoria;
}) {
  const colunas = useMemo(
    () =>
      helper.columns([
        helper.accessor("criado_em", {
          header: "Data e hora",
          cell: (ctx) => (
            <span className="whitespace-nowrap tabular-nums">
              {dataHoraBrasilia(ctx.getValue())}
            </span>
          ),
        }),
        helper.display({
          id: "usuario",
          header: "Usuário",
          cell: (ctx) => {
            const { usuario, usuario_id } = ctx.row.original;
            if (usuario) {
              return (
                <div>
                  <span className="font-medium">{usuario.nome}</span>
                  <span className="block text-xs break-all text-texto-suave">
                    {usuario.email_login}
                  </span>
                </div>
              );
            }
            // Falha de login com CPF sem cadastro chega aqui — e é das linhas
            // que mais interessam. Dizer o motivo evita parecer defeito.
            return (
              <span className="text-texto-suave">
                {usuario_id ? "Usuário não encontrado" : "Sem usuário identificado"}
              </span>
            );
          },
        }),
        helper.accessor("acao", {
          header: "Ação",
          cell: (ctx) => rotuloAcao(ctx.getValue()),
        }),
        helper.accessor("entidade", {
          header: "Entidade",
          cell: (ctx) => (
            <div>
              {rotuloEntidade(ctx.getValue())}
              {ctx.row.original.entidade_id ? (
                <span
                  className="block font-mono text-xs text-texto-suave"
                  title={ctx.row.original.entidade_id}
                >
                  {ctx.row.original.entidade_id.slice(0, 8)}
                </span>
              ) : null}
            </div>
          ),
        }),
        helper.accessor("ip", {
          header: "Origem",
          cell: (ctx) => (
            <span
              className="font-mono text-xs"
              title={ctx.row.original.user_agent ?? undefined}
            >
              {ctx.getValue() ?? "—"}
            </span>
          ),
        }),
        helper.accessor("detalhes", {
          header: "Detalhes",
          cell: (ctx) => {
            const detalhes = ctx.getValue();
            if (detalhes === null) return <span className="text-texto-suave">—</span>;
            return (
              <details className="text-left">
                <summary className="cursor-pointer text-sm text-acao">Ver</summary>
                <pre className="mt-1 max-w-md overflow-x-auto rounded-sm bg-fundo-alt p-2 text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(detalhes, null, 2)}
                </pre>
              </details>
            );
          },
        }),
      ]) as ColumnDef<typeof recursos, EventoAuditoria, unknown>[],
    [],
  );

  const tabela = useTable({ features: recursos, data: eventos, columns: colunas });

  const temFiltro = paraQueryString({ ...filtros, pagina: 1 }) !== "";

  if (total === 0) {
    return (
      <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-10 text-center">
        <p className="font-medium">
          {temFiltro ? "Nenhum evento neste recorte." : "Nenhum evento registrado ainda."}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">
          {temFiltro
            ? "Amplie o período ou limpe os filtros para ver a trilha inteira."
            : "Logins, mudanças de acesso e cadastros aparecem aqui assim que acontecem."}
        </p>
      </div>
    );
  }

  const zebrado = eventos.length > 15;

  return (
    <div className="overflow-hidden rounded-lg border border-borda">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-fundo-alt">
            {tabela.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id} className="hover:bg-transparent">
                {grupo.headers.map((cabecalho) => (
                  <TableHead
                    key={cabecalho.id}
                    className="h-10 px-3 text-xs font-medium text-texto-suave"
                  >
                    {cabecalho.isPlaceholder ? null : <tabela.FlexRender header={cabecalho} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tabela.getRowModel().rows.map((linha, indice) => (
              <TableRow
                key={linha.id}
                className={cn("align-top", zebrado && indice % 2 === 1 && "bg-fundo-alt/60")}
              >
                {linha.getAllCells().map((celula) => (
                  <TableCell key={celula.id} className="px-3 py-2">
                    <tabela.FlexRender cell={celula} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Paginacao total={total} pagina={pagina} paginas={paginas} filtros={filtros} />
    </div>
  );
}

function Paginacao({
  total,
  pagina,
  paginas,
  filtros,
}: {
  total: number;
  pagina: number;
  paginas: number;
  filtros: FiltrosAuditoria;
}) {
  const href = (p: number) => `/admin/auditoria${paraQueryString({ ...filtros, pagina: p })}`;

  return (
    <nav
      aria-label="Páginas da trilha"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-borda bg-fundo-alt px-3 py-2"
    >
      <p className="text-xs text-texto-suave tabular-nums">
        {total.toLocaleString("pt-BR")} {total === 1 ? "evento" : "eventos"}
        {paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}
      </p>

      {paginas > 1 ? (
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            <LinkPagina href={href(pagina - 1)} desabilitado={pagina <= 1} rotulo="Página anterior">
              <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
            </LinkPagina>
          </li>
          {paginasVisiveis(pagina, paginas).map((p, i) =>
            p === null ? (
              <li key={`salto-${i}`} aria-hidden className="px-1 text-xs text-texto-suave">
                …
              </li>
            ) : (
              <li key={p}>
                <LinkPagina href={href(p)} atual={p === pagina} rotulo={`Página ${p}`}>
                  {p}
                </LinkPagina>
              </li>
            ),
          )}
          <li>
            <LinkPagina
              href={href(pagina + 1)}
              desabilitado={pagina >= paginas}
              rotulo="Próxima página"
            >
              <ChevronRight aria-hidden strokeWidth={1.5} className="size-4" />
            </LinkPagina>
          </li>
        </ul>
      ) : null}
    </nav>
  );
}

function LinkPagina({
  href,
  rotulo,
  atual = false,
  desabilitado = false,
  children,
}: {
  href: string;
  rotulo: string;
  atual?: boolean;
  desabilitado?: boolean;
  children: React.ReactNode;
}) {
  const classe = cn(
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs tabular-nums",
    atual
      ? "border-primary bg-primary text-primary-foreground"
      : "border-borda bg-fundo text-texto hover:bg-fundo-alt",
    desabilitado && "pointer-events-none opacity-50",
  );

  if (desabilitado) {
    return (
      <span className={classe} aria-label={rotulo} aria-disabled>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={classe} aria-label={rotulo} aria-current={atual ? "page" : undefined}>
      {children}
    </Link>
  );
}
