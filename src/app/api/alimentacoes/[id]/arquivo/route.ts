import { idValido, resposta } from "@/features/documentos/entrega";
import { registrarAuditoria } from "@/lib/audit";
import { getUsuario } from "@/lib/auth/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Original da alimentação (3e Conecta, 0029) — o áudio ou a foto do produtor.
 *
 * Os passos do download de docs/03, para o bucket `alimentacoes`: sessão;
 * leitura com o client do usuário (`alimentacoes_leitura`: módulo
 * `alimentacoes:ver` e contrato no escopo — invisível é 404); URL assinada de
 * 60 s com `service_role`, porque o bucket não tem policy para ninguém
 * (invariante 3); `auditoria` antes de entregar; redirect.
 *
 * A tela usa `preload="none"` no player: cada vez que alguém de fato ouve,
 * fica um `download` na trilha — e só então.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuario();
  if (!usuario) return resposta("Sua sessão expirou. Entre de novo para abrir o arquivo.", 401, request);

  const { id } = await params;
  if (!idValido(id)) return resposta("Arquivo não encontrado.", 404, request);

  const supabase = await criarClienteServidor();
  const { data: alimentacao, error } = await supabase
    .from("alimentacoes")
    .select("id, arquivo_path, arquivo_mime, contrato_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[alimentacoes] leitura falhou", id, error.message);
    return resposta("Não foi possível abrir o arquivo. Tente novamente em alguns minutos.", 500, request);
  }
  if (!alimentacao) return resposta("Arquivo não encontrado.", 404, request);

  const { data: assinada, error: erroAssinatura } = await criarClienteAdmin()
    .storage.from("alimentacoes")
    .createSignedUrl(alimentacao.arquivo_path, 60);
  if (erroAssinatura || !assinada) {
    console.error("[alimentacoes] URL assinada falhou", id, erroAssinatura?.message);
    return resposta("Não foi possível abrir o arquivo. Tente novamente em alguns minutos.", 500, request);
  }

  const { ok } = await registrarAuditoria({
    acao: "download",
    entidade: "alimentacoes",
    entidadeId: alimentacao.id,
    detalhes: { mime: alimentacao.arquivo_mime, contrato_id: alimentacao.contrato_id },
  });
  if (!ok) {
    return resposta(
      "Não foi possível registrar o acesso, então o arquivo não foi aberto. Tente novamente em alguns minutos.",
      503,
      request,
    );
  }
  return Response.redirect(assinada.signedUrl, 302);
}
