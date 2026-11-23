"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoSelecao } from "@/components/campo-selecao";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { conferirAlimentacao, corrigirTranscricao, recusarAlimentacao } from "@/features/alimentacoes/actions";
import type { Extracao } from "@/features/alimentacoes/extracao";
import { esquemaConferencia } from "@/features/alimentacoes/schemas";

type Opcao = { id: string; nome: string };

/** Sentinela do select de cliente: o Select não aceita valor vazio. */
const SEM_CLIENTE = "sem-cliente";

const ROTULO_FALTOU: Record<Extracao["faltou"][number], string> = {
  cliente: "cliente",
  rubrica: "rubrica",
  valor: "valor",
  competencia: "mês",
};

/**
 * A sugestão das regras, editável. Conferir cria o lançamento com o que está
 * na tela — a sugestão original fica guardada na alimentação para comparar.
 */
export function PainelConferencia({
  id,
  extracao,
  rubricas,
  unidades,
}: {
  id: string;
  extracao: Extracao | null;
  rubricas: Opcao[];
  unidades: Opcao[];
}) {
  const router = useRouter();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof esquemaConferencia>>({
    resolver: zodResolver(esquemaConferencia),
    values: {
      id,
      rubrica_id: extracao?.rubrica_id ?? "",
      unidade_id: extracao?.unidade_id ?? "",
      descricao: extracao?.descricao ?? "",
      valor: extracao?.valor ?? "",
      competencia: extracao?.competencia?.slice(0, 7) ?? "",
    },
  });

  async function conferir() {
    setErroGeral(null);
    // A action valida de novo a entrada crua, não a já transformada.
    const r = await conferirAlimentacao(getValues());
    if (!r.ok) return setErroGeral(r.erro);
    toast.success("Conferida. O lançamento foi criado.");
    router.refresh();
  }

  const faltou = extracao?.faltou ?? [];

  return (
    <div className="grid gap-4">
      {extracao === null ? (
        <p className="rounded-md border border-alerta/40 bg-fundo px-3 py-2 text-sm text-alerta">
          Ainda sem sugestão: escreva a transcrição ao lado e clique em Sugerir campos.
        </p>
      ) : faltou.length > 0 ? (
        <p className="rounded-md border border-alerta/40 bg-fundo px-3 py-2 text-sm text-alerta">
          Não encontrado no texto: {faltou.map((f) => ROTULO_FALTOU[f]).join(", ")}. Preencha antes de conferir.
        </p>
      ) : null}

      <form onSubmit={handleSubmit(conferir)} className="grid gap-1" noValidate>
        <AvisoErro mensagem={erroGeral} />
        <Controller
          control={control}
          name="unidade_id"
          render={({ field }) => (
            <CampoSelecao
              rotulo="Cliente"
              opcoes={[...unidades, { id: SEM_CLIENTE, nome: "Sem cliente identificado" }]}
              valor={field.value || SEM_CLIENTE}
              aoMudar={(v) => field.onChange(v === SEM_CLIENTE ? "" : v)}
              erro={errors.unidade_id?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="rubrica_id"
          render={({ field }) => (
            <CampoSelecao
              rotulo="Rubrica"
              opcoes={rubricas}
              valor={field.value || undefined}
              aoMudar={field.onChange}
              erro={errors.rubrica_id?.message}
            />
          )}
        />
        <CampoTexto rotulo="Descrição" erro={errors.descricao?.message} {...register("descricao")} />
        <div className="grid gap-x-3 sm:grid-cols-2">
          <CampoTexto
            rotulo="Valor (R$)"
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            erro={errors.valor?.message}
            {...register("valor")}
          />
          <CampoTexto rotulo="Competência" type="month" erro={errors.competencia?.message} {...register("competencia")} />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={isSubmitting} className="h-11">
            <Check aria-hidden strokeWidth={1.5} />
            {isSubmitting ? "Conferindo…" : "Conferir e lançar"}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => setRecusando((v) => !v)}>
            Recusar alimentação
          </Button>
        </div>
      </form>

      {recusando ? <FormularioRecusa id={id} aoCancelar={() => setRecusando(false)} /> : null}
    </div>
  );
}

function FormularioRecusa({ id, aoCancelar }: { id: string; aoCancelar: () => void }) {
  const router = useRouter();
  const idCampo = useId();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function recusar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    const r = await recusarAlimentacao({ id, motivo });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Alimentação recusada. Nenhum lançamento foi criado.");
    router.refresh();
  }

  return (
    <form onSubmit={recusar} className="grid gap-2 rounded-md border border-borda bg-fundo-alt p-3" noValidate>
      <AvisoErro mensagem={erro} />
      <Label htmlFor={idCampo}>Por que recusar?</Label>
      <p className="text-sm text-texto-suave">Fica registrado e não muda depois. Nenhum lançamento é criado.</p>
      <Textarea id={idCampo} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="bg-fundo" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={enviando} className="h-11">
          {enviando ? "Recusando…" : "Recusar alimentação"}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={aoCancelar}>
          Voltar
        </Button>
      </div>
    </form>
  );
}

/**
 * Transcrição editável: digitar (sem transcrição automática, ou foto) ou
 * corrigir o que o Whisper entendeu. Salvar refaz a sugestão a partir do texto.
 */
export function TranscricaoEditavel({
  id,
  transcricao,
  tipo,
}: {
  id: string;
  transcricao: string | null;
  tipo: "audio" | "foto";
}) {
  const router = useRouter();
  const idCampo = useId();
  const [texto, setTexto] = useState(transcricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);
    const r = await corrigirTranscricao({ id, transcricao: texto });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Sugestão refeita a partir do texto.");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="grid gap-2" noValidate>
      <AvisoErro mensagem={erro} />
      <Label htmlFor={idCampo}>{tipo === "audio" ? "Transcrição" : "O que a foto mostra"}</Label>
      <p className="text-sm text-texto-suave">
        {transcricao
          ? "Corrija o que a transcrição entendeu errado. O Portal refaz a sugestão a partir do texto."
          : tipo === "audio"
            ? "Ouça o áudio e escreva o que foi dito. O Portal sugere os campos a partir do texto."
            : "Escreva o que a foto mostra (valor, o que foi comprado, de qual propriedade)."}
      </p>
      <Textarea id={idCampo} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div>
        <Button type="submit" variant="outline" disabled={salvando} className="h-11">
          {salvando ? "Sugerindo…" : "Sugerir campos"}
        </Button>
      </div>
    </form>
  );
}
