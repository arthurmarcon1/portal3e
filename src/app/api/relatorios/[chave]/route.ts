import { definicaoDe } from "@/features/relatorios/definicoes";
import { lerRecorte } from "@/features/relatorios/filtros";
import { gerarPdfRelatorio, LIMITE_PDF } from "@/features/relatorios/pdf";
import { gerarRelatorio, RecorteGrandeDemais } from "@/features/relatorios/queries";
import { gerarCsv, nomeDoArquivo } from "@/features/relatorios/relatorio";
import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { registrarAuditoria } from "@/lib/audit";
import { getUsuario, temPermissao } from "@/lib/auth/sessao";
import { ROTULOS_ACAO, ROTULOS_MODULO } from "@/lib/auth/modulos";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Exportação de relatório em CSV ou PDF (F5.3).
 *
 * **Valida sozinho** (invariante 9): sessão, área interna,
 * `relatorios:exportar` e a permissão do módulo de onde o dado sai — para o
 * de acessos, `administracao:exportar` (docs/02: Suporte/Auditoria lê a
 * trilha, não a exporta). Nada de `service_role`: o relatório é lido com o
 * client do usuário, então o escopo de quem exporta é a RLS.
 *
 * **Toda exportação é auditada** — relatório, formato, recorte e número de
 * linhas — ANTES de o arquivo sair. Se o registro falhar, o arquivo não sai.
 */
export async function GET(request: Request, { params }: { params: Promise<{ chave: string }> }) {
  const usuario = await getUsuario();
  if (!usuario) return texto("Sua sessão expirou. Entre de novo para exportar.", 401);

  const { chave } = await params;
  const def = definicaoDe(chave);
  if (!def) return texto("Relatório não encontrado.", 404);

  const exigidas = [{ modulo: "relatorios" as const, acao: "exportar" as const }, def.ver, def.exportar];
  if (usuario.tipo !== "interno") return texto("Relatórios são da equipe interna.", 403);
  for (const p of exigidas) {
    if (!(await temPermissao(p.modulo, p.acao))) {
      return texto(
        `Para exportar este relatório você precisa de ${ROTULOS_MODULO[p.modulo]} › ${ROTULOS_ACAO[p.acao]} (${p.modulo}:${p.acao}). Fale com o administrador do Portal.`,
        403,
      );
    }
  }

  const url = new URL(request.url);
  const formato = url.searchParams.get("formato");
  if (formato !== "csv" && formato !== "pdf") return texto("Formato inválido: use csv ou pdf.", 400);

  const hoje = hojeEmBrasilia();
  const lido = lerRecorte(def.filtro, url.searchParams, hoje);
  if (!lido.ok) return texto(lido.erro, 400);

  let relatorio;
  try {
    relatorio = await gerarRelatorio(def.chave, lido.recorte);
  } catch (erro) {
    if (erro instanceof RecorteGrandeDemais) return texto(erro.message, 422);
    return texto(mensagemDeErro(erro), 500);
  }
  if (formato === "pdf" && relatorio.detalhe.linhas.length > LIMITE_PDF) {
    return texto(
      `São ${relatorio.detalhe.linhas.length} linhas — acima de ${LIMITE_PDF} o PDF fica ilegível. Baixe em CSV ou reduza o período.`,
      422,
    );
  }

  const { ok } = await registrarAuditoria({
    acao: "exportar",
    entidade: "relatorios",
    detalhes: {
      relatorio: def.chave,
      formato,
      recorte: lido.recorte,
      linhas: relatorio.detalhe.linhas.length,
      total: relatorio.total.valor,
    },
  });
  if (!ok) {
    return texto(
      "Não foi possível registrar a exportação, então o arquivo não foi gerado. Tente novamente em alguns minutos.",
      503,
    );
  }

  const cabecalhos = { "cache-control": "no-store" };
  if (formato === "csv") {
    return new Response(gerarCsv(relatorio), {
      headers: {
        ...cabecalhos,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${nomeDoArquivo(def.chave, hoje, "csv")}"`,
      },
    });
  }

  const supabase = await criarClienteServidor();
  const { data: org } = await supabase.from("organizacoes").select("nome").eq("id", usuario.orgId).maybeSingle();
  const pdf = await gerarPdfRelatorio(relatorio, { nome: usuario.nome, organizacao: org?.nome ?? "Portal 3e" });
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...cabecalhos,
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${nomeDoArquivo(def.chave, hoje, "pdf")}"`,
    },
  });
}

function texto(mensagem: string, status: number): Response {
  return new Response(mensagem, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
