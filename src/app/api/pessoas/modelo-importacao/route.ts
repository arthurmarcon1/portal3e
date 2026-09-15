import { COLUNAS } from "@/features/pessoas/importacao";
import { temPermissao, getUsuario } from "@/lib/auth/sessao";
import { gerarModeloXlsx } from "@/lib/planilha";

/**
 * Modelo de planilha da importação (F1.3).
 *
 * Route handler **valida sozinho** (CLAUDE.md, invariante 9): não herda nada
 * da guarda da página, e o proxy não é barreira de autorização. Sem sessão ou
 * sem `pessoas:criar`, não sai arquivo.
 *
 * Não há auditoria aqui de propósito: o modelo é uma planilha vazia, não
 * contém dado de ninguém. O que é auditado é a importação que ela alimenta.
 */

const EXEMPLO = [
  "Maria Aparecida Ferreira",
  "010.007.919-98",
  "3000",
  "Auxiliar de limpeza",
  "042",
  "Unidade Central",
  "01/09/2026",
  "51990100079",
] as const;

export async function GET() {
  const usuario = await getUsuario();
  if (!usuario) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!(await temPermissao("pessoas", "criar"))) {
    return new Response("Sem permissão.", { status: 403 });
  }

  const arquivo = await gerarModeloXlsx(COLUNAS, EXEMPLO);

  return new Response(new Uint8Array(arquivo), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="modelo-importacao-pessoas.xlsx"',
      // Modelo muda com o deploy, não com o tempo. Sem cache para ninguém
      // baixar um modelo velho depois de uma coluna nova entrar.
      "cache-control": "no-store",
    },
  });
}
