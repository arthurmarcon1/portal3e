import { gerarComprovante } from "@/features/documentos/comprovante";
import { idValido, resposta } from "@/features/documentos/entrega";
import { registrarAuditoria } from "@/lib/audit";
import { getUsuario } from "@/lib/auth/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Comprovante de ciência em PDF (F3.5) — gerado sob demanda, nunca guardado.
 *
 * Valida sozinho (invariante 9), e quem autoriza é a RLS, com o client do
 * usuário:
 * - a ciência, por `ciencias_leitura` (0016): o titular sempre; terceiro com
 *   `documentos:ver`, escopo e a categoria do documento;
 * - o documento, a pessoa e a organização, cada um pela própria policy. Se
 *   qualquer um deles não chega a este usuário, é 404 — o comprovante não
 *   sai pela metade, nem confirma a existência do que ele não vê.
 *
 * A saída do comprovante é registrada em `auditoria` (`download`, entidade
 * `ciencias`) ANTES de o arquivo sair: comprovante leva nome e parte do CPF.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuario();
  if (!usuario) return resposta("Sua sessão expirou. Entre de novo para baixar o comprovante.", 401);

  const { id } = await params;
  if (!idValido(id)) return resposta("Comprovante não encontrado.", 404);

  const supabase = await criarClienteServidor();
  const { data: ciencia, error } = await supabase
    .from("ciencias")
    .select(
      `id, org_id, protocolo, tipo, justificativa, respondido_em, documento_versao, documento_hash,
       pessoas(nome, cpf),
       documentos(titulo, documento_tipos(nome)),
       organizacoes(nome, cnpj)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[comprovante] leitura falhou", id, error.message);
    return resposta("Não foi possível gerar o comprovante. Tente novamente em alguns minutos.", 500);
  }
  if (!ciencia || !ciencia.pessoas || !ciencia.documentos || !ciencia.organizacoes) {
    return resposta("Comprovante não encontrado.", 404);
  }

  let pdf: Buffer;
  try {
    pdf = await gerarComprovante({
      protocolo: ciencia.protocolo,
      tipo: ciencia.tipo,
      justificativa: ciencia.justificativa,
      respondidoEm: ciencia.respondido_em,
      pessoa: ciencia.pessoas,
      documento: {
        titulo: ciencia.documentos.titulo,
        tipoNome: ciencia.documentos.documento_tipos?.nome ?? "Documento",
        // Versão e hash DA CIÊNCIA: o arquivo a que a pessoa respondeu.
        versao: ciencia.documento_versao,
        hash: ciencia.documento_hash,
      },
      organizacao: ciencia.organizacoes,
    });
  } catch (erro) {
    console.error("[comprovante] geração falhou", id, erro);
    return resposta("Não foi possível gerar o comprovante. Tente novamente em alguns minutos.", 500);
  }

  const { ok } = await registrarAuditoria({
    acao: "download",
    entidade: "ciencias",
    entidadeId: ciencia.id,
    detalhes: { comprovante: true, protocolo: ciencia.protocolo },
  });
  if (!ok) {
    return resposta(
      "Não foi possível registrar o acesso, então o comprovante não foi gerado. Tente novamente em alguns minutos.",
      503,
    );
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="comprovante-${ciencia.protocolo}.pdf"`,
      // Dado pessoal: nem proxy nem navegador guardam cópia.
      "cache-control": "private, no-store",
    },
  });
}
