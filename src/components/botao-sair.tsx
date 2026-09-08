import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sair } from "@/features/auth/actions";

/**
 * Sair. Formulário de verdade: funciona sem JavaScript, que é o cenário do
 * celular antigo com a conexão ruim.
 */
export function BotaoSair() {
  return (
    <form action={sair}>
      <Button type="submit" variant="ghost" className="h-11 px-2">
        <LogOut aria-hidden strokeWidth={1.5} />
        Sair
      </Button>
    </form>
  );
}
