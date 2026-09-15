import { gerarCsvAuditoria } from "@/features/auditoria/csv";
import { lerFiltros, paraQueryString } from "@/features/auditoria/filtros";
import { eventosParaExportacao } from "@/features/auditoria/queries";
import { registrarAuditoria } from "@/lib/audit";
import { getUsuario, temPermissao } from "@/lib/auth/sessao";
import { mensagemDeErro } from "@/lib/erros";

/**
 * Exportação da trilha de auditoria em CSV (F2.2).
 *
 * Route handler **valida sozinho** (CLAUDE.md, invariante 9): não herda o
 * layout de `/admin/auditoria`, e o proxy não é barreira. Exige
 * `administracao:exportar` — a ação mais forte é checada onde é executada,
 * não só `ver`. A leitura em si continua com o client do usuário, então a RLS
 * de `auditoria` vale aqui também.
 *
 * **A exportação é auditada**, com o recorte e o número de linhas, ANTES de o
 * arquivo sair. Se o registro vier depois, uma conexão que cai no meio deixa
 * o arquivo entregue e o log sem a linha.
 *
 * As mensagens de erro vão em texto puro: quem chama é o `fetch` da tela, que
 * as mostra em toast.
 */
export async function GET(request: Request) {
  const usuario = await getUsuario();
  if (!usuario) {
    return texto("Sua sessão expirou. Entre de novo para exportar.", 401);
  }
  // As duas fronteiras que a tela herda dos layouts, refeitas aqui: área
  // (`exigirTipo("interno")` em `(admin)/layout.tsx`) e ação.
  if (usuario.tipo !== "interno" || !(await temPermissao("administracao", "exportar"))) {
    return texto(
      "Você não tem permissão para exportar a auditoria. Fale com o administrador do Portal.",
      403,
    );
  }

  const filtros = lerFiltros(new URL(request.url).searchParams);

  let csv: string;
  let linhas: number;
  try {
    const eventos = await eventosParaExportacao(filtros);
    linhas = eventos.length;
    csv = gerarCsvAuditoria(eventos);
  } catch (erro) {
    return texto(mensagemDeErro(erro), 422);
  }

  const { ok } = await registrarAuditoria({
    acao: "exportar",
    entidade: "auditoria",
    detalhes: {
      filtros: {
        de: filtros.de ?? null,
        ate: filtros.ate ?? null,
        usuario: filtros.usuario ?? null,
        acao: filtros.acao ?? null,
        entidade: filtros.entidade ?? null,
      },
      linhas,
    },
  });

  // Exportação que não deixou rastro não sai. `registrarAuditoria` nunca
  // lança, mas diz se gravou — e aqui o rastro é a condição da entrega.
  if (!ok) {
    return texto(
      "Não foi possível registrar a exportação, então o arquivo não foi gerado. Tente novamente em alguns minutos.",
      503,
    );
  }

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const sufixo = paraQueryString({ ...filtros, pagina: 1 }) ? "-filtrada" : "";

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="auditoria-${hoje}${sufixo}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function texto(mensagem: string, status: number): Response {
  return new Response(mensagem, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
