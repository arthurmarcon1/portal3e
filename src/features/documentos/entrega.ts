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

/**
 * Resposta de erro das rotas de arquivo.
 *
 * Com `request` e o navegador abrindo o link direto ("Baixar o PDF", "Baixar
 * o comprovante"), sai uma página mínima com a mensagem e o caminho de volta
 * — texto puro numa aba é tela sem saída (docs/04). O `fetch` do visualizador
 * não é navegação e continua recebendo texto.
 */
export function resposta(mensagem: string, status: number, request?: Request): Response {
  if (request && ehNavegacao(request)) {
    return new Response(paginaDeErro(mensagem), {
      status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(mensagem, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function ehNavegacao(request: Request): boolean {
  const modo = request.headers.get("sec-fetch-mode");
  if (modo) return modo === "navigate";
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Sem o CSS do app: a página tem de abrir mesmo se o resto falhou. Cores e
 * medidas são os tokens de docs/04, copiados à mão.
 */
function paginaDeErro(mensagem: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Portal 3e</title>
<style>
  body { margin: 0; background: #F6F7F8; color: #1A1D21; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 28rem; margin: 0 auto; padding: 2.5rem 1rem; }
  .caixa { background: #FFFFFF; border: 1px solid #DDE1E6; border-radius: 8px; padding: 1.5rem; }
  h1 { font-size: 1.25rem; font-weight: 500; margin: 0 0 .5rem; }
  a { display: flex; align-items: center; justify-content: center; min-height: 48px; margin-top: 1.5rem;
      border-radius: 6px; background: #14532D; color: #FFFFFF; text-decoration: none; font-weight: 500; }
  a:focus-visible { outline: 2px solid #1A1D21; outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <div class="caixa">
    <h1>Portal 3e</h1>
    <p>${escapar(mensagem)}</p>
    <a href="/">Voltar ao Portal</a>
  </div>
</main>
</body>
</html>`;
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
