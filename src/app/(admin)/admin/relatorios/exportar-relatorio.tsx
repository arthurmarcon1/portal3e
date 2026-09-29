"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Botões de exportação. A rota valida e audita; aqui só se baixa o arquivo
 * e, se a rota recusar, mostra a mensagem dela (permissão, recorte grande).
 */
export function ExportarRelatorio({ chave, query }: { chave: string; query: string }) {
  const [gerando, setGerando] = useState<"csv" | "pdf" | null>(null);

  async function baixar(formato: "csv" | "pdf") {
    setGerando(formato);
    try {
      const resposta = await fetch(`/api/relatorios/${chave}?formato=${formato}${query ? `&${query}` : ""}`);
      if (!resposta.ok) {
        toast.error((await resposta.text()) || "Não foi possível gerar o arquivo. Tente novamente em alguns minutos.");
        return;
      }
      const arquivo = await resposta.blob();
      const nome =
        /filename="([^"]+)"/.exec(resposta.headers.get("content-disposition") ?? "")?.[1] ?? `relatorio.${formato}`;
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação gerada e registrada na auditoria.");
    } catch {
      toast.error("Não foi possível gerar o arquivo. Confira a conexão e tente de novo.");
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={() => baixar("csv")} disabled={gerando !== null}>
        <Download aria-hidden strokeWidth={1.5} />
        {gerando === "csv" ? "Gerando…" : "CSV"}
      </Button>
      <Button type="button" variant="outline" onClick={() => baixar("pdf")} disabled={gerando !== null}>
        <Download aria-hidden strokeWidth={1.5} />
        {gerando === "pdf" ? "Gerando…" : "PDF"}
      </Button>
    </div>
  );
}
