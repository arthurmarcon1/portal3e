import type { ReactNode } from "react";

/**
 * Moldura das telas sem sessão.
 *
 * Uma coluna, centralizada, largura de leitura. Mobile first: o funcionário
 * entra pelo celular, muitas vezes na portaria.
 */
export default function LayoutAutenticacao({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-fundo-alt">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        {children}
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-texto-suave">
        Portal 3e · 3e Gestão de Pessoas
      </footer>
    </div>
  );
}
