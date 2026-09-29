import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { definicaoDe, type ChaveRelatorio } from "@/features/relatorios/definicoes";
import { lerRecorte, paraQuery, type Recorte } from "@/features/relatorios/filtros";
import { gerarRelatorio, RecorteGrandeDemais } from "@/features/relatorios/queries";
import type { Tabela } from "@/features/relatorios/relatorio";
import { registrarAuditoria } from "@/lib/audit";
import { temPermissao } from "@/lib/auth/sessao";

import { ExportarRelatorio } from "./exportar-relatorio";

/** Na tela, uma amostra; o arquivo leva tudo. */
const AMOSTRA = 200;

/**
 * Tela comum aos seis relatórios (F5.3). Quem a monta é a `page.tsx` de cada
 * um, que declara as permissões em `paginaProtegida` — aqui só se lê e
 * desenha. Ver na tela não é exportar: não gera auditoria; baixar, sim (na
 * rota). A exceção é o relatório que audita quem audita (acessos e
 * downloads): abrir já grava `ver` — e, sem o registro, o dado não aparece,
 * como o arquivo que não sai na exportação.
 */
export async function TelaRelatorio({
  chave,
  searchParams,
}: {
  chave: ChaveRelatorio;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const def = definicaoDe(chave)!;
  const brutos = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(brutos)) if (typeof v === "string") params.set(k, v);

  const lido = lerRecorte(def.filtro, params, hojeEmBrasilia());
  const recorte: Recorte = lido.ok ? lido.recorte : (lerRecorte(def.filtro, new URLSearchParams(), hojeEmBrasilia()) as { ok: true; recorte: Recorte }).recorte;

  const [podeExportar, resultado] = await Promise.all([
    Promise.all([temPermissao("relatorios", "exportar"), temPermissao(def.exportar.modulo, def.exportar.acao)]).then(
      ([a, b]) => a && b,
    ),
    gerarRelatorio(chave, recorte).then(
      (r) => ({ ok: true as const, r }),
      (e: unknown) => {
        if (e instanceof RecorteGrandeDemais) return { ok: false as const, erro: e.message };
        throw e;
      },
    ),
  ]);

  let semRastro = false;
  if (def.auditaVisualizacao && resultado.ok) {
    const { ok } = await registrarAuditoria({
      acao: "ver",
      entidade: "relatorios",
      detalhes: { relatorio: chave, recorte, linhas: resultado.r.detalhe.linhas.length },
    });
    semRastro = !ok;
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <Link href="/admin/relatorios" className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
        <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
        Relatórios
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl">{def.titulo}</h1>
          <p className="mt-1 text-sm text-texto-suave">{def.descricao}</p>
        </div>
        {podeExportar && resultado.ok && !semRastro ? <ExportarRelatorio chave={chave} query={paraQuery(recorte)} /> : null}
      </div>

      {def.filtro !== "nenhum" ? <FormularioRecorte recorte={recorte} /> : null}
      {!lido.ok ? <p className="mb-4 text-sm text-erro">{lido.erro} Mostrando o recorte padrão.</p> : null}

      {semRastro ? (
        <p className="text-erro">
          Não foi possível registrar esta consulta na auditoria, então o relatório não é mostrado. Tente novamente em
          alguns minutos.
        </p>
      ) : !resultado.ok ? (
        <p className="text-erro">{resultado.erro}</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-texto-suave tabular-nums">
            {resultado.r.recorte} · {resultado.r.total.valor} {resultado.r.total.rotulo}
            {podeExportar ? "" : " · exportar pede relatorios:exportar e a permissão do módulo"}
          </p>
          {resultado.r.resumo && resultado.r.resumo.linhas.length > 0 ? (
            <section className="mb-6">
              <h2 className="mb-2 text-lg">Resumo</h2>
              <TabelaSimples tabela={resultado.r.resumo} />
            </section>
          ) : null}
          <section>
            <h2 className="mb-2 text-lg">Detalhe</h2>
            {resultado.r.detalhe.linhas.length === 0 ? (
              <p className="text-texto-suave">Nenhum registro no recorte.</p>
            ) : (
              <>
                <TabelaSimples tabela={{ ...resultado.r.detalhe, linhas: resultado.r.detalhe.linhas.slice(0, AMOSTRA) }} />
                {resultado.r.detalhe.linhas.length > AMOSTRA ? (
                  <p className="mt-2 text-sm text-texto-suave">
                    Mostrando {AMOSTRA} de {resultado.r.detalhe.linhas.length} linhas. O arquivo leva todas.
                  </p>
                ) : null}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function FormularioRecorte({ recorte }: { recorte: Recorte }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
      {recorte.tipo === "periodo" ? (
        <>
          <div className="grid gap-1">
            <Label htmlFor="de" className="text-xs text-texto-suave">De</Label>
            <Input id="de" name="de" type="date" defaultValue={recorte.de} className="h-9 w-40 tabular-nums" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ate" className="text-xs text-texto-suave">Até</Label>
            <Input id="ate" name="ate" type="date" defaultValue={recorte.ate} className="h-9 w-40 tabular-nums" />
          </div>
        </>
      ) : recorte.tipo === "competencia" ? (
        <div className="grid gap-1">
          <Label htmlFor="competencia" className="text-xs text-texto-suave">Competência</Label>
          <Input id="competencia" name="competencia" type="month" defaultValue={recorte.competencia} className="h-9 w-44 tabular-nums" />
        </div>
      ) : recorte.tipo === "situacao" ? (
        <div className="grid gap-1">
          <Label htmlFor="situacao" className="text-xs text-texto-suave">Situação</Label>
          <select
            id="situacao"
            name="situacao"
            defaultValue={recorte.situacao}
            className="h-9 w-44 rounded-md border border-borda bg-fundo px-2 text-sm"
          >
            <option value="todas">Todas</option>
            <option value="vencidas">Só vencidas</option>
          </select>
        </div>
      ) : null}
      <Button type="submit" variant="outline" className="h-9">Aplicar</Button>
    </form>
  );
}

function TabelaSimples({ tabela }: { tabela: Tabela }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borda">
      <table className="w-full text-sm">
        <thead className="bg-fundo-alt text-left text-texto-suave">
          <tr>
            {tabela.colunas.map((c) => (
              <th key={c} className="px-3 py-2 font-normal whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {tabela.linhas.map((l, i) => (
            <tr key={i}>
              {l.map((v, j) => (
                <td key={j} className={`px-3 py-2 ${typeof v === "number" ? "text-right tabular-nums" : ""}`}>
                  {v === null || v === "" ? "—" : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
