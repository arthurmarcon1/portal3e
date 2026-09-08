import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Erro de formulário no topo do card.
 *
 * O `Alert` do shadcn já tem `role="alert"`, então o leitor de tela anuncia
 * assim que a mensagem aparece.
 */
export function AvisoErro({ mensagem }: { mensagem?: string | null }) {
  if (!mensagem) return null;

  return (
    <Alert variant="destructive" className="border-erro/30">
      <TriangleAlert aria-hidden strokeWidth={1.5} />
      <AlertDescription>{mensagem}</AlertDescription>
    </Alert>
  );
}
