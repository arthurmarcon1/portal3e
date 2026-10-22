import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Endereço que não existe no Portal, para qualquer tipo de usuário (no lugar
 * da página padrão do Next, em inglês e sem saída). "/" leva cada um à
 * própria área — ou ao login, sem sessão.
 */
export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-xl">Não encontramos esta página</h1>
      <p className="mt-2">O link pode estar incompleto ou ter mudado.</p>
      <Button asChild className="mt-6 h-12 w-full text-base">
        <Link href="/">Voltar ao Portal</Link>
      </Button>
    </main>
  );
}
