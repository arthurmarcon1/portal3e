"use client";

import Link from "next/link";
import { AlertTriangle, Check, Upload } from "lucide-react";
import { unzipSync } from "fflate";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoSelecao } from "@/components/campo-selecao";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  analisarLoteEspelhos,
  publicarLoteEspelhos,
  salvarRegraEspelho,
  type AnaliseDoLote,
  type ResultadoDoLote,
} from "@/features/jornada/actions";
import { MOTIVOS, nomeBase, rotuloCompetencia, type Regra } from "@/features/jornada/casamento";
import { cn } from "@/lib/utils";

/**
 * Publicação de espelhos em lote (F4.1): escolher → conferir → resultado.
 *
 * A conferência é obrigatória e mostra SEMPRE a lista de não casados, mesmo
 * vazia — "nada é publicado sem ver quem ficou de fora". O botão de publicar
 * só existe nessa etapa.
 *
 * O ZIP é aberto aqui no navegador: ao servidor vão primeiro só os nomes (a
 * análise) e depois os PDFs casados, em envios de até ~6 MB — a Server Action
 * tem teto de 8 MB, e um fechamento inteiro passa disso com folga.
 */

const LIMITE_ENVIO = 6 * 1024 * 1024;
const MAX_POR_ENVIO = 20;
const TODOS = "todos";

type Etapa = "escolher" | "conferir" | "publicando" | "resultado";

function mesAnterior(): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m] = hoje.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 2, 1));
  return data.toISOString().slice(0, 7);
}

/** PDFs soltos ou de dentro de ZIPs. O nome guarda a pasta, para não colidir. */
async function lerArquivos(lista: FileList): Promise<File[]> {
  const saida: File[] = [];
  for (const arquivo of Array.from(lista)) {
    const nome = arquivo.name.toLowerCase();
    if (nome.endsWith(".pdf")) {
      saida.push(arquivo);
    } else if (nome.endsWith(".zip")) {
      const conteudo = unzipSync(new Uint8Array(await arquivo.arrayBuffer()), {
        filter: (f) => f.name.toLowerCase().endsWith(".pdf") && !f.name.startsWith("__MACOSX"),
      });
      for (const [caminho, bytes] of Object.entries(conteudo)) {
        saida.push(new File([bytes as Uint8Array<ArrayBuffer>], caminho, { type: "application/pdf" }));
      }
    }
  }
  return saida;
}

/** Envios de no máximo 20 arquivos e ~6 MB. */
function emLotes(arquivos: File[]): File[][] {
  const lotes: File[][] = [];
  let atual: File[] = [];
  let bytes = 0;
  for (const a of arquivos) {
    if (atual.length && (atual.length >= MAX_POR_ENVIO || bytes + a.size > LIMITE_ENVIO)) {
      lotes.push(atual);
      atual = [];
      bytes = 0;
    }
    atual.push(a);
    bytes += a.size;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

export function TelaPublicacaoEspelhos({
  regraInicial,
  contratos,
  podeEditarRegra,
}: {
  regraInicial: Regra;
  contratos: { id: string; nome: string }[];
  podeEditarRegra: boolean;
}) {
  const campoArquivos = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>("escolher");
  const [competencia, setCompetencia] = useState(mesAnterior());
  const [contrato, setContrato] = useState(TODOS);
  const [prazo, setPrazo] = useState("");
  const [expressao, setExpressao] = useState(regraInicial.expressao);
  const [campo, setCampo] = useState(regraInicial.campo);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [lendo, setLendo] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [analise, setAnalise] = useState<AnaliseDoLote | null>(null);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState<ResultadoDoLote | null>(null);

  const dadosDoLote = () => ({
    expressao,
    campo,
    competencia,
    contrato_id: contrato === TODOS ? null : contrato,
  });

  async function escolher(evento: React.ChangeEvent<HTMLInputElement>) {
    if (!evento.target.files?.length) return;
    setErro(null);
    setLendo(true);
    try {
      const lidos = await lerArquivos(evento.target.files);
      setArquivos(lidos);
      if (!lidos.length) setErro("Nenhum PDF encontrado. Envie arquivos .pdf ou um .zip com eles.");
    } catch {
      setErro("Não foi possível abrir o ZIP. Confira se o arquivo não está corrompido.");
    } finally {
      setLendo(false);
    }
  }

  async function salvarRegra() {
    const r = await salvarRegraEspelho({ expressao, campo });
    if (r.ok) toast.success("Regra salva como padrão da organização.");
    else toast.error(r.erro);
  }

  async function analisar() {
    setErro(null);
    setTrabalhando(true);
    try {
      const r = await analisarLoteEspelhos({ ...dadosDoLote(), nomes: arquivos.map((a) => a.name) });
      if (!r.ok) return setErro(r.erro);
      setAnalise(r.dados);
      setEtapa("conferir");
    } finally {
      setTrabalhando(false);
    }
  }

  async function publicar() {
    if (!analise) return;
    const casados = new Set(analise.casados.map((c) => c.arquivo));
    const paraEnviar = arquivos.filter((a) => casados.has(a.name));
    const lotes = emLotes(paraEnviar);
    const acumulado: ResultadoDoLote = { publicados: [], recusados: [] };

    setEtapa("publicando");
    setProgresso({ feitos: 0, total: paraEnviar.length });
    for (const lote of lotes) {
      const formData = new FormData();
      formData.append("dados", JSON.stringify({ ...dadosDoLote(), prazo_ciencia: prazo }));
      for (const a of lote) formData.append("arquivos", a, a.name);
      const r = await publicarLoteEspelhos(formData);
      if (r.ok) {
        acumulado.publicados.push(...r.dados.publicados);
        acumulado.recusados.push(...r.dados.recusados);
      } else {
        for (const a of lote) acumulado.recusados.push({ arquivo: a.name, motivo: r.erro });
      }
      setProgresso((p) => ({ ...p, feitos: p.feitos + lote.length }));
    }
    setResultado(acumulado);
    setEtapa("resultado");
  }

  function recomecar() {
    setEtapa("escolher");
    setAnalise(null);
    setResultado(null);
    setArquivos([]);
    if (campoArquivos.current) campoArquivos.current.value = "";
  }

  // ------------------------------------------------------------------
  if (etapa === "resultado" && resultado && analise) {
    return (
      <div className="grid gap-4">
        <dl className="grid gap-2 rounded-lg border border-borda bg-fundo-alt px-4 py-4 text-sm sm:grid-cols-3">
          <Numero rotulo="Espelhos publicados" valor={resultado.publicados.length} />
          <Numero rotulo="Não publicados" valor={resultado.recusados.length} alerta={resultado.recusados.length > 0} />
          <Numero rotulo="Pessoas sem espelho" valor={analise.semEspelho.length} alerta={analise.semEspelho.length > 0} />
        </dl>
        <ListaArquivos
          titulo="Não publicados"
          vazio="Todos os arquivos casados foram publicados."
          itens={resultado.recusados.map((r) => ({ chave: r.arquivo, principal: nomeBase(r.arquivo), detalhe: r.motivo }))}
        />
        <ListaArquivos
          titulo="Pessoas sem espelho nesta competência"
          vazio="Todas as pessoas esperadas receberam espelho."
          itens={analise.semEspelho.map((p) => ({ chave: p.id, principal: p.nome }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/admin/documentos">Ver documentos</Link>
          </Button>
          <Button type="button" variant="outline" onClick={recomecar}>
            Publicar outro lote
          </Button>
        </div>
      </div>
    );
  }

  if (etapa === "publicando") {
    return (
      <p aria-live="polite" className="rounded-lg border border-borda bg-fundo-alt px-4 py-8 text-center">
        Publicando {progresso.feitos} de {progresso.total}… Não feche esta página.
      </p>
    );
  }

  if (etapa === "conferir" && analise) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-texto-suave">
          Competência <strong className="text-texto">{rotuloCompetencia(analise.competencia)}</strong> ·{" "}
          {arquivos.length} {arquivos.length === 1 ? "arquivo" : "arquivos"}
        </p>
        <dl className="grid gap-2 rounded-lg border border-borda bg-fundo-alt px-4 py-4 text-sm sm:grid-cols-3">
          <Numero rotulo="Serão publicados" valor={analise.casados.length} />
          <Numero rotulo="Não casados" valor={analise.naoCasados.length} alerta={analise.naoCasados.length > 0} />
          <Numero rotulo="Pessoas sem espelho" valor={analise.semEspelho.length} alerta={analise.semEspelho.length > 0} />
        </dl>

        <ListaArquivos
          titulo="Não casados — não serão publicados"
          vazio="Nenhum. Todos os arquivos casaram com uma pessoa."
          destaque
          itens={analise.naoCasados.map((n) => ({
            chave: n.arquivo,
            principal: nomeBase(n.arquivo),
            detalhe: `${MOTIVOS[n.motivo]}${n.pessoaNome ? ` (${n.pessoaNome})` : ""}`,
          }))}
        />
        <ListaArquivos
          titulo="Pessoas sem espelho neste lote"
          vazio="Nenhuma. Toda pessoa esperada tem arquivo."
          itens={analise.semEspelho.map((p) => ({ chave: p.id, principal: p.nome }))}
        />
        <details className="rounded-lg border border-borda">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Ver os {analise.casados.length} casamentos
          </summary>
          <ul className="divide-y divide-borda border-t border-borda">
            {analise.casados.map((c) => (
              <li key={c.arquivo} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                <span className="break-all">{nomeBase(c.arquivo)}</span>
                <span className="text-texto-suave">{c.pessoaNome}</span>
              </li>
            ))}
          </ul>
        </details>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={publicar} disabled={analise.casados.length === 0}>
            {analise.casados.length === 1 ? "Publicar 1 espelho" : `Publicar ${analise.casados.length} espelhos`}
          </Button>
          <Button type="button" variant="outline" onClick={() => setEtapa("escolher")}>
            Voltar e ajustar
          </Button>
        </div>
        <p className="text-sm text-texto-suave">
          Cada pessoa recebe um aviso e passa a ter uma pendência de ciência. Publicar não pode ser
          desfeito; para corrigir um espelho, retifique o documento.
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  return (
    <div className="grid max-w-2xl gap-4">
      <AvisoErro mensagem={erro} />

      <div className="grid gap-x-3 sm:grid-cols-2">
        <CampoTexto
          rotulo="Competência"
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
        />
        <CampoTexto
          rotulo="Prazo de ciência (opcional)"
          dica="Vazio: o padrão do espelho, contado da publicação."
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
        />
      </div>

      <CampoSelecao
        rotulo="Contrato"
        dica="Só muda a lista de pessoas sem espelho. O casamento vale para todo o seu alcance."
        opcoes={[{ id: TODOS, nome: "Todos os contratos" }, ...contratos]}
        valor={contrato}
        aoMudar={setContrato}
      />

      <fieldset className="grid gap-2 rounded-lg border border-borda p-3">
        <legend className="px-1 text-sm font-medium">Como achar a pessoa no nome do arquivo</legend>
        <CampoTexto
          rotulo="Expressão regular"
          dica="O primeiro grupo entre parênteses é o CPF ou a matrícula."
          value={expressao}
          onChange={(e) => setExpressao(e.target.value)}
          className="font-mono"
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-4">
          {(
            [
              ["cpf", "CPF"],
              ["matricula", "Matrícula"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="campo"
                checked={campo === valor}
                onChange={() => setCampo(valor)}
                className="size-4 accent-acao"
              />
              {rotulo}
            </label>
          ))}
          {podeEditarRegra ? (
            <Button type="button" variant="outline" size="sm" onClick={salvarRegra}>
              Salvar como padrão
            </Button>
          ) : null}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="arquivos">Arquivos</Label>
        <p className="text-sm text-texto-suave">PDFs do fechamento, ou um ZIP com eles.</p>
        <input
          ref={campoArquivos}
          id="arquivos"
          type="file"
          multiple
          accept=".pdf,.zip,application/pdf,application/zip"
          onChange={escolher}
          className="text-sm file:mr-3 file:h-11 file:rounded-md file:border file:border-borda file:bg-fundo file:px-3"
        />
        <p aria-live="polite" className="min-h-5 text-sm text-texto-suave">
          {lendo ? "Lendo os arquivos…" : arquivos.length ? `${arquivos.length} PDFs prontos para conferir.` : ""}
        </p>
      </div>

      <div>
        <Button type="button" onClick={analisar} disabled={!arquivos.length || trabalhando || lendo}>
          <Upload aria-hidden strokeWidth={1.5} />
          {trabalhando ? "Conferindo…" : "Conferir casamento"}
        </Button>
      </div>
    </div>
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

function ListaArquivos({
  titulo,
  vazio,
  itens,
  destaque = false,
}: {
  titulo: string;
  vazio: string;
  itens: { chave: string; principal: string; detalhe?: string }[];
  destaque?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-borda">
      <h2 className="flex items-center gap-2 border-b border-borda bg-fundo-alt px-4 py-2 text-sm font-medium">
        {itens.length ? (
          <AlertTriangle aria-hidden strokeWidth={1.5} className={cn("size-4", destaque ? "text-alerta" : "text-texto-suave")} />
        ) : (
          <Check aria-hidden strokeWidth={1.5} className="size-4 text-sucesso" />
        )}
        {titulo} ({itens.length})
      </h2>
      {itens.length === 0 ? (
        <p className="px-4 py-3 text-sm text-texto-suave">{vazio}</p>
      ) : (
        <ul className="max-h-80 divide-y divide-borda overflow-y-auto">
          {itens.map((i) => (
            <li key={i.chave} className="px-4 py-2 text-sm">
              <span className="font-medium break-all">{i.principal}</span>
              {i.detalhe ? <span className="block text-texto-suave">{i.detalhe}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
