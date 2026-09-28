import { idValido, resposta } from "@/features/documentos/entrega";
import { registrarAuditoria } from "@/lib/audit";
import { getUsuario } from "@/lib/auth/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Anexo de solicitação (F4.2) — foto de divergência, atestado, PDF.
 *
 * Os passos do download de docs/03, para o bucket `anexos`: sessão; leitura
 * com o client do usuário (`anexos_leitura`: só anexo de solicitação que ele
 * enxerga — invisível é 404); URL assinada de 60 s com `service_role`, porque
 * o bucket não tem policy para ninguém (invariante 3); `auditoria` antes de
 * entregar; redirect. Nunca armazenado em cache.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuario();
  if (!usuario) return resposta("Sua sessão expirou. Entre de novo para abrir o anexo.", 401);

  const { id } = await params;
  if (!idValido(id)) return resposta("Anexo não encontrado.", 404);

  const supabase = await criarClienteServidor();
  const { data: anexo, error } = await supabase
    .from("anexos")
    .select("id, solicitacao_id, arquivo_path, mime")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[anexos] leitura falhou", id, error.message);
    return resposta("Não foi possível abrir o anexo. Tente novamente em alguns minutos.", 500);
  }
  if (!anexo) return resposta("Anexo não encontrado.", 404);

  const { data: assinada, error: erroAssinatura } = await criarClienteAdmin()
    .storage.from("anexos")
    .createSignedUrl(anexo.arquivo_path, 60);
  if (erroAssinatura || !assinada) {
    console.error("[anexos] URL assinada falhou", id, erroAssinatura?.message);
    return resposta("Não foi possível abrir o anexo. Tente novamente em alguns minutos.", 500);
  }

  const { ok } = await registrarAuditoria({
    acao: "download",
    entidade: "anexos",
    entidadeId: anexo.id,
    detalhes: { solicitacao_id: anexo.solicitacao_id, mime: anexo.mime },
  });
  if (!ok) {
    return resposta(
      "Não foi possível registrar o acesso, então o anexo não foi aberto. Tente novamente em alguns minutos.",
      503,
    );
  }
  return Response.redirect(assinada.signedUrl, 302);
}
