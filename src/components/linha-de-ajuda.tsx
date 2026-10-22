import Link from "next/link";

import { ATENDIMENTO, TIPO_DUVIDA } from "@/features/funcionario/textos";

/**
 * "Nunca sem saída" (docs/04): toda tela do funcionário diz a quem pedir
 * ajuda. Texto suave, sem caixa e sem cor — é caminho, não chamada.
 */
export function LinhaDeAjuda() {
  return (
    <footer className="mx-auto w-full max-w-xl px-4 pt-2 pb-6 text-texto-suave">
      <p>
        Precisa de ajuda?{" "}
        <Link
          href={`/pedidos/novo?tipo=${TIPO_DUVIDA}`}
          className="py-3 text-acao underline underline-offset-2"
        >
          Faça um pedido de Dúvida
        </Link>{" "}
        ou fale com {ATENDIMENTO.contato}.
      </p>
    </footer>
  );
}
