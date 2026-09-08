"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmação de ação destrutiva (docs/04).
 *
 * O botão é nomeado pela ação — "Desativar contratante" — nunca "OK". Quem
 * lê rápido demais e clica no lugar errado precisa ver o que aconteceu no
 * próprio botão.
 */
export function DialogoConfirmacao({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rotuloAcao,
  destrutivo = true,
  aoConfirmar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao: ReactNode;
  rotuloAcao: string;
  destrutivo?: boolean;
  aoConfirmar: () => Promise<void>;
}) {
  const [processando, setProcessando] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={processando}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={destrutivo ? "destructive" : "default"}
            disabled={processando}
            onClick={async () => {
              setProcessando(true);
              try {
                await aoConfirmar();
              } finally {
                setProcessando(false);
              }
            }}
          >
            {processando ? "Aguarde…" : rotuloAcao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
