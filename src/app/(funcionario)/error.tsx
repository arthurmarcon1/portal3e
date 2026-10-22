"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ATENDIMENTO } from "@/features/funcionario/textos";

/**
 * Erro inesperado numa tela do funcionário. Nunca sem saída (docs/04): tentar
 * de novo, voltar ao início, e a quem pedir ajuda. O erro em si não aparece —
 * vai para o console, onde quem desenvolve o encontra.
 */
export default function ErroNaArea({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[funcionario] erro na tela", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="text-xl">Algo deu errado ao abrir esta tela</h1>
      <p className="mt-2">
        Tente de novo. Se continuar, faça um pedido de Dúvida ou avise {ATENDIMENTO.contato}.
      </p>
      <div className="mt-6 grid gap-2">
        <Button type="button" className="h-12 w-full text-base" onClick={() => retry()}>
          Tentar de novo
        </Button>
        <Button asChild variant="outline" className="h-12 w-full text-base">
          <Link href="/inicio">Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
}
