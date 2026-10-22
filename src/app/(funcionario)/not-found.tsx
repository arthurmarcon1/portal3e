import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Documento ou pedido que não existe — ou que a RLS não entrega a esta pessoa,
 * que para a tela é a mesma coisa. Nunca sem saída (docs/04): diz o que pode
 * ter acontecido e leva de volta ao início. A linha de ajuda vem do layout.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="text-xl">Não encontramos esta página</h1>
      <p className="mt-2">
        O link pode estar incompleto, ou o documento foi trocado por uma versão nova.
      </p>
      <Button asChild className="mt-6 h-12 w-full text-base">
        <Link href="/inicio">Voltar ao início</Link>
      </Button>
    </main>
  );
}
