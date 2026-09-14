"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Download, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  analisarPlanilhaDePessoas,
  importarPessoas,
  type ResumoImportacao,
} from "@/features/pessoas/actions";
import type { Analise } from "@/features/pessoas/importacao";

/**
 * Importação em três estados: escolher arquivo → conferir → resultado.
 *
 * A pré-visualização é obrigatória. O critério da F1.3 é explícito: a tela
 * mostra, **antes** de importar, quantas linhas valem, quantas têm erro e
 * qual é o erro de cada uma. Não existe caminho que grave direto do upload.
 */
export function TelaImportacao() {
  const router = useRouter();
  const campoArquivo = useRef<HTMLInputElement>(null);

  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [importando, iniciarImportacao] = useTransition();

  function recomecar() {
    setAnalise(null);
    setResumo(null);
    setNomeArquivo(null);
    if (campoArquivo.current) campoArquivo.current.value = "";
  }

  async function aoEscolherArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setResumo(null);
    setAnalise(null);
    setNomeArquivo(arquivo.name);
    setAnalisando(true);

    const formData = new FormData();
    formData.append("arquivo", arquivo);

    const resultado = await analisarPlanilhaDePessoas(formData);
    setAnalisando(false);

    if (!resultado.ok) {
      toast.error(resultado.erro);
      recomecar();
      return;
    }
    setAnalise(resultado.dados);
  }

  function importar() {
    if (!analise) return;

    iniciarImportacao(async () => {
      const validas = analise.linhas.filter((l) => l.erros.length === 0);
      const resultado = await importarPessoas({ linhas: validas.map((l) => l.dados) });

      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }

      setResumo(resultado.dados);
      setAnalise(null);
      toast.success("Importação concluída.");
      router.refresh();
    });
  }

  // ------------------------------------------------------------------
  // Estado 3: resultado
  // ------------------------------------------------------------------
  if (resumo) {
    return (
      <div className="grid gap-4">
        <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-5">
          <p className="flex items-center gap-2 font-medium">
            <Check aria-hidden strokeWidth={1.5} className="size-5 text-sucesso" />
            Importação concluída.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
            <Numero rotulo="Linhas lidas" valor={resumo.total + resumo.ignorados} />
            <Numero rotulo="Pessoas criadas" valor={resumo.criados} />
            <Numero rotulo="Pessoas atualizadas" valor={resumo.atualizados} />
            <Numero rotulo="Linhas ignoradas" valor={resumo.ignorados} />
          </dl>
          <p className="mt-3 text-sm text-texto-suave">
            {resumo.alocacoes_criadas === 0
              ? "Nenhuma alocação nova: todas já existiam no mesmo posto e função."
              : `${resumo.alocacoes_criadas} ${resumo.alocacoes_criadas === 1 ? "alocação criada" : "alocações criadas"}.`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={() => router.push("/admin/pessoas")}>
            Ver o quadro
          </Button>
          <Button type="button" variant="outline" onClick={recomecar}>
            Importar outra planilha
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Estado 2: conferência
  // ------------------------------------------------------------------
  if (analise) {
    const comErro = analise.linhas.filter((l) => l.erros.length > 0);

    return (
      <div className="grid gap-4">
        <p className="text-sm text-texto-suave">
          Arquivo <strong className="text-texto">{nomeArquivo}</strong>
        </p>

        <dl className="grid gap-2 rounded-lg border border-borda bg-fundo-alt px-4 py-4 text-sm sm:grid-cols-4">
          <Numero rotulo="Linhas válidas" valor={analise.validas} />
          <Numero rotulo="Linhas com erro" valor={analise.comErro} alerta={analise.comErro > 0} />
          <Numero rotulo="Serão criadas" valor={analise.criara} />
          <Numero rotulo="Serão atualizadas" valor={analise.atualizara} />
        </dl>

        {analise.atualizara > 0 ? (
          <p className="text-sm text-texto-suave">
            CPF já cadastrado não vira duplicata: o nome, a matrícula e o telefone são
            atualizados, e a alocação só é criada se ainda não existir no mesmo posto e
            função.
          </p>
        ) : null}

        {comErro.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-borda">
            <p className="flex items-center gap-2 border-b border-borda bg-fundo-alt px-4 py-2 text-sm font-medium">
              <AlertTriangle aria-hidden strokeWidth={1.5} className="size-4 text-alerta" />
              {comErro.length === 1
                ? "1 linha não será importada"
                : `${comErro.length} linhas não serão importadas`}
            </p>
            <ul className="divide-y divide-borda">
              {comErro.map((linha) => (
                <li key={linha.numero} className="px-4 py-2 text-sm">
                  <span className="font-medium tabular-nums">Linha {linha.numero}</span>
                  {linha.dados.nome ? (
                    <span className="text-texto-suave"> · {linha.dados.nome}</span>
                  ) : null}
                  <ul className="mt-0.5 text-texto-suave">
                    {linha.erros.map((erro) => (
                      <li key={erro}>{erro}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={importar} disabled={importando || analise.validas === 0}>
            {importando
              ? "Importando…"
              : analise.validas === 1
                ? "Importar 1 linha"
                : `Importar ${analise.validas} linhas`}
          </Button>
          <Button type="button" variant="outline" onClick={recomecar} disabled={importando}>
            Escolher outro arquivo
          </Button>
        </div>

        <p className="text-sm text-texto-suave">
          A gravação é tudo ou nada: se qualquer linha falhar no banco, nenhuma é
          gravada.
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Estado 1: escolher arquivo
  // ------------------------------------------------------------------
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-8 text-center">
        <p className="font-medium">Envie a planilha do quadro.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">
          Arquivo .xlsx ou .csv, com as colunas nome, cpf, matricula, funcao, contrato,
          unidade, data_inicio e telefone. O contrato vai pelo número e a unidade pelo
          nome, como estão cadastrados.
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={() => campoArquivo.current?.click()}
            disabled={analisando}
          >
            <Upload aria-hidden strokeWidth={1.5} />
            {analisando ? "Lendo a planilha…" : "Escolher planilha"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="/api/pessoas/modelo-importacao">
              <Download aria-hidden strokeWidth={1.5} />
              Baixar modelo
            </a>
          </Button>
        </div>

        <input
          ref={campoArquivo}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={aoEscolherArquivo}
        />
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-texto-suave">{rotulo}</dt>
      <dd className={`text-xl tabular-nums ${alerta ? "text-alerta" : ""}`}>{valor}</dd>
    </div>
  );
}
