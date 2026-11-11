import { idValido, resposta } from "@/features/documentos/entrega";
import { registrarAuditoria } from "@/lib/audit";
import { getUsuario } from "@/lib/auth/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Comprovante de lançamento do financeiro (foto ou PDF da nota).
 *
 * Os passos do download de docs/03, para o bucket `financeiro`: sessão;
 * leitura com o client do usuário (`lancamento_anexos_leitura` exige interno,
 * `financeiro:ver` e o contrato no escopo — invisível é 404); URL assinada de
 * 60 s com `service_role`, porque o bucket não tem policy para ninguém
 * (invariante 3); `auditoria` antes de entregar; redirect.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuario();
  if (!usuario) return resposta("Sua sessão expirou. Entre de novo para abrir o comprovante.", 401, request);

  const { id } = await params;
  if (!idValido(id)) return resposta("Comprovante não encontrado.", 404, request);

  const supabase = await criarClienteServidor();
  const { data: anexo, error } = await supabase
    .from("lancamento_anexos")
    .select("id, lancamento_id, arquivo_path, mime")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[financeiro] leitura do anexo falhou", id, error.message);
    return resposta("Não foi possível abrir o comprovante. Tente novamente em alguns minutos.", 500, request);
  }
  if (!anexo) return resposta("Comprovante não encontrado.", 404, request);

  const { data: assinada, error: erroAssinatura } = await criarClienteAdmin()
    .storage.from("financeiro")
    .createSignedUrl(anexo.arquivo_path, 60);
  if (erroAssinatura || !assinada) {
    console.error("[financeiro] URL assinada falhou", id, erroAssinatura?.message);
    return resposta("Não foi possível abrir o comprovante. Tente novamente em alguns minutos.", 500, request);
  }

  const { ok } = await registrarAuditoria({
    acao: "download",
    entidade: "lancamento_anexos",
    entidadeId: anexo.id,
    detalhes: { lancamento_id: anexo.lancamento_id, mime: anexo.mime },
  });
  if (!ok) {
    return resposta(
      "Não foi possível registrar o acesso, então o comprovante não foi aberto. Tente novamente em alguns minutos.",
      503,
      request,
    );
  }
  return Response.redirect(assinada.signedUrl, 302);
}
