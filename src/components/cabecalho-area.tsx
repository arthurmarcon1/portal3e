import { BotaoSair } from "@/components/botao-sair";

/** Barra superior das três áreas: identidade do Portal, nome de quem entrou e sair. */
export function CabecalhoArea({ nome }: { nome: string }) {
  return (
    <header className="border-b border-borda bg-fundo">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <span className="font-medium">Portal 3e</span>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-texto-suave sm:inline">{nome}</span>
          <BotaoSair />
        </div>
      </div>
    </header>
  );
}
