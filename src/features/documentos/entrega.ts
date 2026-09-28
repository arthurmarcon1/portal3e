import "server-only";

import { registrarAuditoria } from "@/lib/audit";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Entrega do arquivo: URL assinada, auditoria, redirect — os passos 4 a 6 de
 * docs/03 ("Storage"), comuns ao download (F3.2) e à prévia do rascunho
 * (F3.1).
 *
 * Quem chama já fez 1 a 3: sessão, leitura com o client do usuário (a RLS
 * decidiu) e a checagem de código de uso único. Chegar aqui significa que o
 * usuário PODE receber o arquivo; esta função não decide acesso nenhum.
 *
 * `service_role` porque o bucket `documentos` não tem policy para ninguém
 * (invariante 3): o único jeito de o arquivo sair é esta URL de 60 segundos,
 * gerada depois da RLS.
 */

export const TTL_SEGUNDOS = 60;

export function resposta(mensagem: string, status: number): Response {
  return new Response(mensagem, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Nome do arquivo no download: o título, só com caracteres seguros. */
export function nomeDoArquivo(titulo: string, versao: number): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "documento"}${versao > 1 ? `-v${versao}` : ""}.pdf`;
}

export async function entregarArquivo(entrega: {
  documentoId: string;
  arquivoPath: string;
  /** `ver` abre inline (tela de ciência, prévia); `download` baixa o arquivo. */
  acao: "ver" | "download";
  /** Com valor, a URL força download com este nome. */
  nomeDownload?: string;
  detalhes: Record<string, unknown>;
}): Promise<Response> {
  const { data: assinada, error } = await criarClienteAdmin()
    .storage.from("documentos")
    .createSignedUrl(
      entrega.arquivoPath,
      TTL_SEGUNDOS,
      entrega.nomeDownload ? { download: entrega.nomeDownload } : undefined,
    );
  if (error || !assinada) {
    console.error("[documentos] URL assinada falhou", entrega.documentoId, error?.message);
    return resposta("Não foi possível abrir o documento. Tente novamente em alguns minutos.", 500);
  }

  // Antes de entregar: se o registro falha, o arquivo não sai. "Quem baixou
  // o quê" é fato registrado, não suposição (docs/03).
  const { ok } = await registrarAuditoria({
    acao: entrega.acao,
    entidade: "documentos",
    entidadeId: entrega.documentoId,
    detalhes: entrega.detalhes,
  });
  if (!ok) {
    return resposta(
      "Não foi possível registrar o acesso, então o documento não foi aberto. Tente novamente em alguns minutos.",
      503,
    );
  }

  return Response.redirect(assinada.signedUrl, 302);
}

/** Id de documento na URL: uuid, ou nem vale consultar. */
export function idValido(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
