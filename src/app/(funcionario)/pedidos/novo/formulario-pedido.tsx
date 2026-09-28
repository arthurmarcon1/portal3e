"use client";

import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { abrirSolicitacao } from "@/features/solicitacoes/actions";
import { ROTULO_TIPO, TIPOS_FUNCIONARIO } from "@/features/solicitacoes/fluxo";

/** O que cada tipo pede na explicação — frase curta, sem jargão (docs/04). */
const DICA: Record<string, string> = {
  ferias: "Diga o período que você quer tirar.",
  afastamento: "Diga o motivo e as datas. Se tiver atestado, anexe a foto.",
  correcao_ponto: "Diga o dia e o horário que ficou errado.",
  atualizacao_cadastral: "Diga o que mudou: telefone, endereço, e-mail…",
  suporte: "Conte o que está acontecendo.",
};

/**
 * Pedido do funcionário (F4.2), para celular. Tipo em botões grandes, uma
 * explicação e, se quiser, uma foto ou PDF (atestado, comprovante).
 */
export function FormularioPedido() {
  const id = useId();
  const router = useRouter();
  const campoAnexo = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!tipo) return setErro("Escolha o tipo de pedido.");
    if (descricao.trim().length < 10) return setErro("Explique o pedido com pelo menos 10 caracteres.");
    setErro(null);
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.set("tipo", tipo);
      dados.set("descricao", descricao.trim());
      if (anexo) dados.set("anexo", anexo);
      const r = await abrirSolicitacao(dados);
      if (!r.ok) return setErro(r.erro);
      toast.success(`Pedido ${r.dados.protocolo} enviado`);
      router.push(`/pedidos/${r.dados.id}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-5" noValidate>
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium">O que você precisa?</legend>
        {TIPOS_FUNCIONARIO.map((t) => (
          <label
            key={t}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-borda px-3 has-[:checked]:border-acao has-[:checked]:bg-acao/5"
          >
            <input
              type="radio"
              name="tipo"
              value={t}
              checked={tipo === t}
              onChange={() => setTipo(t)}
              className="size-5 accent-acao"
            />
            {ROTULO_TIPO[t]}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-descricao`} className="text-base">
          Explique
        </Label>
        {tipo ? <p className="text-texto-suave">{DICA[tipo]}</p> : null}
        <Textarea
          id={`${id}-descricao`}
          rows={5}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="text-base md:text-base"
          maxLength={4000}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="font-medium">Anexo (opcional)</span>
        <input
          ref={campoAnexo}
          id={`${id}-anexo`}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => setAnexo(e.target.files?.[0] ?? null)}
        />
        {anexo ? (
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-borda px-3">
            <span className="truncate">{anexo.name}</span>
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => {
                setAnexo(null);
                if (campoAnexo.current) campoAnexo.current.value = "";
              }}
            >
              <X aria-hidden strokeWidth={1.5} />
              Remover
            </Button>
          </div>
        ) : (
          <Label
            htmlFor={`${id}-anexo`}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-borda text-base font-normal"
          >
            <Paperclip aria-hidden strokeWidth={1.5} className="size-5" />
            Anexar foto ou PDF
          </Label>
        )}
      </div>

      <p aria-live="polite" role={erro ? "alert" : undefined} className="min-h-5 text-erro">
        {erro}
      </p>

      <Button type="submit" className="h-12 w-full text-base" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar pedido"}
      </Button>
    </form>
  );
}
