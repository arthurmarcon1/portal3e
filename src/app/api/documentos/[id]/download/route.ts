import { entregarArquivo, idValido, nomeDoArquivo, resposta } from "@/features/documentos/entrega";
import { getUsuario } from "@/lib/auth/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Download seguro (F3.2) — os 6 passos da seção "Storage" de docs/03.
 *
 * 1. valida a sessão — sozinho, sem herdar layout nem proxy (invariante 9);
 * 2. consulta o documento **com o client do usuário**: quem autoriza é a RLS
 *    (`documentos_leitura`), não um `if`. Titular, coletivo que o alcança,
 *    terceiro com permissão, escopo e categoria — e o titular também lê o
 *    arquivado (0016). Documento invisível é 404, igual a inexistente: a
 *    rota não confirma a existência do que o usuário não pode ver;
 * 3. tipo com `exige_2fa` e sessão sem verificação válida → 428, e a tela
 *    abre o modal de código. A verificação é a F3.3; até ela existir,
 *    nenhuma sessão está verificada e todo tipo com 2FA devolve 428;
 * 4. URL assinada de 60 segundos;
 * 5. `auditoria` com IP, user-agent e id — antes de o arquivo sair;
 * 6. redireciona.
 *
 * `?baixar=1` força o download com o título como nome; sem ele, o PDF abre
 * inline — é o que a tela de ciência (F3.4) embute. Os dois são registrados:
 * `download` e `ver`.
 *
 * Rascunho não sai por aqui: tem rota própria, só para quem edita
 * (`/api/documentos/[id]/previa`).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuario();
  if (!usuario) return resposta("Sua sessão expirou. Entre de novo para abrir o documento.", 401);

  const { id } = await params;
  if (!idValido(id)) return resposta("Documento não encontrado.", 404);

  const supabase = await criarClienteServidor();
  const { data: documento, error } = await supabase
    .from("documentos")
    .select("id, titulo, versao, competencia, arquivo_path, documento_tipos(categoria, exige_2fa)")
    .eq("id", id)
    .in("status", ["publicado", "arquivado"])
    .maybeSingle();

  if (error) {
    console.error("[documentos] download: leitura falhou", id, error.message);
    return resposta("Não foi possível abrir o documento. Tente novamente em alguns minutos.", 500);
  }
  if (!documento || !documento.documento_tipos) return resposta("Documento não encontrado.", 404);

  if (documento.documento_tipos.exige_2fa) {
    // F3.3: aqui entra "a sessão tem verificação válida nos últimos 15 min?".
    return resposta(
      "Este documento exige um código de confirmação enviado ao seu e-mail antes de abrir.",
      428,
    );
  }

  const baixar = new URL(request.url).searchParams.get("baixar") === "1";

  return entregarArquivo({
    documentoId: documento.id,
    arquivoPath: documento.arquivo_path,
    acao: baixar ? "download" : "ver",
    nomeDownload: baixar ? nomeDoArquivo(documento.titulo, documento.versao) : undefined,
    detalhes: {
      versao: documento.versao,
      competencia: documento.competencia,
      categoria: documento.documento_tipos.categoria,
    },
  });
}
