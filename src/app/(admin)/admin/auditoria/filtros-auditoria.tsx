"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FiltroSelecao, TODOS } from "@/components/tabela/filtro-selecao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paraQueryString, type FiltrosAuditoria as Filtros } from "@/features/auditoria/filtros";
import type { OpcoesDeFiltro } from "@/features/auditoria/queries";
import { rotuloAcao, rotuloEntidade } from "@/features/auditoria/rotulos";

/**
 * Barra de filtros da trilha.
 *
 * Aplicar navega para a URL do recorte — o servidor lê os parâmetros e pagina.
 * Nada é filtrado no navegador: com 100 por página, filtrar só a página
 * carregada daria um resultado errado com cara de certo.
 */
export function FiltrosAuditoria({
  filtros,
  opcoes,
  podeExportar,
}: {
  filtros: Filtros;
  opcoes: OpcoesDeFiltro;
  podeExportar: boolean;
}) {
  const router = useRouter();
  const idDe = useId();
  const idAte = useId();

  const [de, setDe] = useState(filtros.de ?? "");
  const [ate, setAte] = useState(filtros.ate ?? "");
  const [usuario, setUsuario] = useState(filtros.usuario ?? TODOS);
  const [acao, setAcao] = useState(filtros.acao ?? TODOS);
  const [entidade, setEntidade] = useState(filtros.entidade ?? TODOS);
  const [exportando, setExportando] = useState(false);

  // O que está na tela, não o que está digitado: o CSV é do recorte aplicado.
  const recorteAplicado = paraQueryString({ ...filtros, pagina: 1 });

  function aplicar(evento: FormEvent) {
    evento.preventDefault();
    if (de && ate && de > ate) {
      toast.error("A data inicial é depois da final. Confira o período.");
      return;
    }
    router.push(
      `/admin/auditoria${paraQueryString({
        de: de || undefined,
        ate: ate || undefined,
        usuario: usuario || undefined,
        acao: acao || undefined,
        entidade: entidade || undefined,
      })}`,
    );
  }

  async function exportar() {
    setExportando(true);
    try {
      const resposta = await fetch(`/api/auditoria/exportar${recorteAplicado}`);
      if (!resposta.ok) {
        toast.error(
          (await resposta.text()) ||
            "Não foi possível gerar o arquivo. Tente novamente em alguns minutos.",
        );
        return;
      }
      const arquivo = await resposta.blob();
      const nome =
        /filename="([^"]+)"/.exec(resposta.headers.get("content-disposition") ?? "")?.[1] ??
        "auditoria.csv";

      const url = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação gerada.");
    } catch {
      toast.error("Não foi possível gerar o arquivo. Confira a conexão e tente de novo.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <form onSubmit={aplicar} className="mb-4 flex flex-wrap items-end gap-2">
      <div className="grid gap-1">
        <Label htmlFor={idDe} className="text-xs text-texto-suave">
          De
        </Label>
        <Input
          id={idDe}
          type="date"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          className="h-9 w-40 tabular-nums"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={idAte} className="text-xs text-texto-suave">
          Até
        </Label>
        <Input
          id={idAte}
          type="date"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="h-9 w-40 tabular-nums"
        />
      </div>

      <FiltroSelecao
        rotulo="Usuário"
        opcoes={opcoes.usuarios}
        valor={usuario}
        aoMudar={setUsuario}
        largura="w-56"
      />
      <FiltroSelecao
        rotulo="Ação"
        opcoes={opcoes.acoes.map((a) => ({ id: a, nome: rotuloAcao(a) }))}
        valor={acao}
        aoMudar={setAcao}
        rotuloTodos="Todas"
      />
      <FiltroSelecao
        rotulo="Entidade"
        opcoes={opcoes.entidades.map((e) => ({ id: e, nome: rotuloEntidade(e) }))}
        valor={entidade}
        aoMudar={setEntidade}
        rotuloTodos="Todas"
        largura="w-44"
      />

      <Button type="submit">Aplicar filtros</Button>
      {recorteAplicado ? (
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/auditoria")}>
          Limpar
        </Button>
      ) : null}

      {podeExportar ? (
        <Button
          type="button"
          variant="outline"
          className="ml-auto"
          onClick={exportar}
          disabled={exportando}
        >
          <Download aria-hidden strokeWidth={1.5} />
          {exportando ? "Gerando…" : "Exportar CSV"}
        </Button>
      ) : null}
    </form>
  );
}
