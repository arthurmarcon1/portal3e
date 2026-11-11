"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { descartarLancamento } from "@/features/financeiro/actions";

/**
 * Descartar não apaga: o lançamento fica na lista, riscado, com o motivo
 * (invariante 8). Por isso o motivo é obrigatório.
 */
export function BotaoDescartar({ lancamentoId, descricao }: { lancamentoId: string; descricao: string }) {
  const router = useRouter();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [processando, setProcessando] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => setAberto(true)}>
        Descartar
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => !v && setAberto(false)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setProcessando(true);
              const r = await descartarLancamento({ lancamento_id: lancamentoId, motivo });
              setProcessando(false);
              if (!r.ok) {
                toast.error(r.erro);
                return;
              }
              toast.success("Lançamento descartado.");
              setAberto(false);
              router.refresh();
            }}
          >
            <DialogHeader>
              <DialogTitle>Descartar lançamento?</DialogTitle>
              <DialogDescription>
                “{descricao}” sai dos números do mês, mas continua na lista com o motivo.
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 grid gap-1.5">
              <Label htmlFor={id}>Motivo</Label>
              <Input
                id={id}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: lançado em duplicidade"
                className="h-11"
                required
                maxLength={240}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={processando}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={processando || motivo.trim().length === 0}>
                {processando ? "Aguarde…" : "Descartar lançamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
