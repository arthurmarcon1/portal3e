"use client";

import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Tabela padrão da área interna (docs/04).
 *
 * - cabeçalho em `--fundo-alt`, linha com borda inferior de 1px
 * - zebrado só acima de 15 linhas
 * - paginação no rodapé, com o total à esquerda: o usuário precisa saber
 *   quantos itens existem. Nunca scroll infinito.
 * - estado vazio com frase útil, sem ilustração
 *
 * A busca é global e case-insensitive sobre os campos que a tela declarar em
 * `camposDeBusca` — assim a página escolhe o que faz sentido procurar, em vez
 * de a tabela adivinhar.
 */

const POR_PAGINA = 15;

/**
 * Recursos registrados da tabela.
 *
 * O TanStack v9 não embute mais nada: cada feature usada é declarada aqui, e
 * só existe API para o que está nesta lista. Ordenação e paginação bastam —
 * a busca é feita fora da tabela, no `useMemo` abaixo, porque cada tela
 * decide o que faz sentido procurar.
 */
export const recursosTabela = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

export type RecursosTabela = typeof recursosTabela;

/** Coluna desta tabela. Use `criarColunas` para montar com tipagem. */
export type ColunaDe<T extends RowData> = ColumnDef<RecursosTabela, T, unknown>;

/** Helper de colunas já amarrado aos recursos acima. */
export function criarColunas<T extends RowData>() {
  return createColumnHelper<RecursosTabela, T>();
}

export type TabelaDadosProps<T extends RowData> = {
  colunas: ColunaDe<T>[];
  dados: T[];
  camposDeBusca: (linha: T) => string;
  rotuloBusca: string;
  /** Filtros extras da tela (situação, contratante...). */
  filtros?: ReactNode;
  /** Ação principal do cabeçalho — normalmente "Novo…". */
  acao?: ReactNode;
  vazio: { titulo: string; descricao: string };
  /** Texto do rodapé no singular e no plural: ["contratante", "contratantes"]. */
  substantivo: [string, string];
};

export function TabelaDados<T extends RowData>({
  colunas,
  dados,
  camposDeBusca,
  rotuloBusca,
  filtros,
  acao,
  vazio,
  substantivo,
}: TabelaDadosProps<T>) {
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<SortingState>([]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados;
    return dados.filter((linha) => camposDeBusca(linha).toLowerCase().includes(termo));
  }, [busca, dados, camposDeBusca]);

  const tabela = useTable({
    features: recursosTabela,
    data: filtrados,
    columns: colunas,
    state: { sorting: ordenacao },
    onSortingChange: setOrdenacao,
    initialState: { pagination: { pageIndex: 0, pageSize: POR_PAGINA } },
  });

  const linhas = tabela.getRowModel().rows;
  const total = filtrados.length;
  const zebrado = total > 15;
  const [singular, plural] = substantivo;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search
              aria-hidden
              strokeWidth={1.5}
              className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-texto-suave"
            />
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={rotuloBusca}
              aria-label={rotuloBusca}
              className="h-9 w-64 pl-8"
            />
          </div>
          {filtros}
        </div>
        {acao}
      </div>

      {dados.length === 0 ? (
        <EstadoVazio {...vazio} />
      ) : total === 0 ? (
        <EstadoVazio
          titulo="Nenhum resultado para essa busca."
          descricao="Confira a escrita ou limpe os filtros para ver a lista inteira."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-borda">
          <Table>
            <TableHeader className="bg-fundo-alt">
              {tabela.getHeaderGroups().map((grupo) => (
                <TableRow key={grupo.id} className="hover:bg-transparent">
                  {grupo.headers.map((cabecalho) => (
                    <TableHead
                      key={cabecalho.id}
                      className="h-10 px-3 text-xs font-medium text-texto-suave last:text-right"
                    >
                      {cabecalho.isPlaceholder ? null : (
                        <tabela.FlexRender header={cabecalho} />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {linhas.map((linha, indice) => (
                <TableRow
                  key={linha.id}
                  className={zebrado && indice % 2 === 1 ? "bg-fundo-alt/60" : undefined}
                >
                  {linha.getAllCells().map((celula) => (
                    <TableCell key={celula.id} className="px-3 py-2 last:text-right">
                      <tabela.FlexRender cell={celula} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3 border-t border-borda bg-fundo-alt px-3 py-2">
            <p className="text-xs text-texto-suave tabular-nums">
              {total} {total === 1 ? singular : plural}
              {tabela.getPageCount() > 1
                ? ` · página ${tabela.state.pagination!.pageIndex + 1} de ${tabela.getPageCount()}`
                : ""}
            </p>
            {tabela.getPageCount() > 1 ? (
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => tabela.previousPage()}
                  disabled={!tabela.getCanPreviousPage()}
                >
                  <ChevronLeft aria-hidden strokeWidth={1.5} />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => tabela.nextPage()}
                  disabled={!tabela.getCanNextPage()}
                >
                  Próxima
                  <ChevronRight aria-hidden strokeWidth={1.5} />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma frase que diz o que aconteceu e o que fazer. Sem ilustração (docs/04). */
function EstadoVazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-10 text-center">
      <p className="font-medium">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">{descricao}</p>
    </div>
  );
}
