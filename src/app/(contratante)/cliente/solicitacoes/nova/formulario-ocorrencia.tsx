"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AvisoErro } from "@/components/aviso-erro";
import { CampoSelecao } from "@/components/campo-selecao";
import { CampoTexto } from "@/components/campo-texto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { abrirSolicitacao } from "@/features/solicitacoes/actions";
import { ROTULO_TIPO, TIPOS_CONTRATANTE } from "@/features/solicitacoes/fluxo";

const QUALQUER = "qualquer";

/** Ocorrência ou substituição, num contrato (e unidade) do escopo. */
export function FormularioOcorrencia({
  contratos,
}: {
  contratos: { id: string; numero: string; unidades: { id: string; nome: string }[] }[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>("ocorrencia");
  const [contrato, setContrato] = useState(contratos.length === 1 ? contratos[0].id : "");
  const [unidade, setUnidade] = useState(QUALQUER);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const unidades = contratos.find((c) => c.id === contrato)?.unidades ?? [];

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.set("tipo", tipo);
      dados.set("contrato_id", contrato);
      if (unidade !== QUALQUER) dados.set("unidade_id", unidade);
      dados.set("titulo", titulo);
      dados.set("descricao", descricao);
      if (anexo) dados.set("anexo", anexo);
      const r = await abrirSolicitacao(dados);
      if (!r.ok) return setErro(r.erro);
      toast.success(`Solicitação ${r.dados.protocolo} aberta`);
      router.push(`/cliente/solicitacoes/${r.dados.id}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-4" noValidate>
      <AvisoErro mensagem={erro} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        {TIPOS_CONTRATANTE.map((t) => (
          <label key={t} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} className="size-4 accent-acao" />
            {ROTULO_TIPO[t]}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <CampoSelecao
          rotulo="Contrato"
          opcoes={contratos.map((c) => ({ id: c.id, nome: c.numero }))}
          valor={contrato}
          aoMudar={(v) => {
            setContrato(v);
            setUnidade(QUALQUER);
          }}
        />
        <CampoSelecao
          rotulo="Unidade (opcional)"
          opcoes={[{ id: QUALQUER, nome: "Todas / não se aplica" }, ...unidades]}
          valor={unidade}
          aoMudar={setUnidade}
        />
      </div>
      <CampoTexto rotulo="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} />
      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea id="descricao" rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="anexo">Anexo (opcional)</Label>
        <Input id="anexo" type="file" accept="image/*,application/pdf" className="h-11 py-2" onChange={(e) => setAnexo(e.target.files?.[0] ?? null)} />
      </div>
      <div>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Abrir solicitação"}
        </Button>
      </div>
    </form>
  );
}
