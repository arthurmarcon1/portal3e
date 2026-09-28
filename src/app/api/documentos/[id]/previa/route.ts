import { entregarArquivo, idValido, resposta as texto } from "@/features/documentos/entrega";
import { getUsuario, temPermissao } from "@/lib/auth/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Pré-visualização do arquivo de um RASCUNHO (F3.1: "salvar como rascunho,
 * pré-visualizar e só então publicar").
 *
 * Segue os passos do download de docs/03 ("Storage"), restrito a rascunho —
 * documento publicado sai por `/api/documentos/[id]/download`, da F3.2:
 *
 * 1. valida a sessão, o tipo e `documentos:editar` — sozinho, sem herdar
 *    nada de layout nem de proxy (invariante 9);
 * 2. lê o documento com o client do usuário: a RLS de rascunho (0010) decide
 *    categoria e escopo, e documento invisível é 404, igual a inexistente;
 * 3. tipo com `exige_2fa` devolve 428 — o código de uso único é a F3.3, e
 *    rascunho de holerite é holerite (invariante 4);
 * 4–6. URL assinada de 60 segundos, `auditoria` antes de entregar e
 *    redirect — em `entregarArquivo`, o mesmo caminho do download (F3.2).
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuario();
  if (!usuario) return texto("Sua sessão expirou. Entre de novo para ver o documento.", 401);

  if (usuario.tipo !== "interno" || !(await temPermissao("documentos", "editar"))) {
    return texto(
      "Você não tem permissão para pré-visualizar rascunhos. Fale com o administrador do Portal.",
      403,
    );
  }

  const { id } = await params;
  if (!idValido(id)) return texto("Documento não encontrado.", 404);

  const supabase = await criarClienteServidor();
  const { data: documento, error } = await supabase
    .from("documentos")
    .select("id, arquivo_path, versao, documento_tipos(categoria, exige_2fa)")
    .eq("id", id)
    .eq("status", "rascunho")
    .maybeSingle();

  if (error) {
    console.error("[documentos] prévia: leitura falhou", id, error.message);
    return texto("Não foi possível abrir o documento. Tente novamente em alguns minutos.", 500);
  }
  if (!documento || !documento.documento_tipos) return texto("Documento não encontrado.", 404);

  if (documento.documento_tipos.exige_2fa) {
    return texto(
      "Este tipo de documento exige código de uso único para ser aberto, e a verificação ainda não está disponível.",
      428,
    );
  }

  return entregarArquivo({
    documentoId: documento.id,
    arquivoPath: documento.arquivo_path,
    acao: "ver",
    detalhes: {
      previa: true,
      versao: documento.versao,
      categoria: documento.documento_tipos.categoria,
    },
  });
}
