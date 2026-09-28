import "server-only";

import { contratosParaAlocacao, type ContratoComUnidades } from "@/features/pessoas/queries";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * Leitura de documentos para a área interna (F3.1).
 *
 * Sempre com o client do usuário. Quem decide o que aparece — categoria,
 * escopo, rascunho só para quem edita — é a RLS (0010, 0012, 0015). Esta
 * camada não repete nenhuma dessas regras.
 */

type Categoria = Database["public"]["Enums"]["categoria_doc"];
type StatusDocumento = Database["public"]["Enums"]["status_documento"];

/**
 * Tipos cadastrados que ainda não têm tela de publicação.
 *
 * `aso` entra só como tipo no MVP; a tela chega com o módulo de SST, na
 * Fase 5 (decisão provisória de 2026-09-28, docs/06). Não é regra de acesso
 * — quem publica ASO continua decidido pela RLS —, é o limite do MVP.
 */
const FORA_DA_TELA_DE_PUBLICACAO = new Set(["aso"]);

export type TipoDocumento = {
  id: string;
  chave: string;
  nome: string;
  categoria: Categoria;
  exige_ciencia: boolean;
  exige_2fa: boolean;
  prazo_ciencia_dias: number | null;
};

export type DocumentoLinha = {
  id: string;
  titulo: string;
  tipo_nome: string;
  escopo: "individual" | "coletivo";
  pessoa_nome: string | null;
  versao: number;
  status: StatusDocumento;
  prazo_ciencia: string | null;
  publicado_em: string | null;
  criado_em: string;
};

export async function listarDocumentos(): Promise<DocumentoLinha[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("documentos")
    .select(
      "id, titulo, escopo, versao, status, prazo_ciencia, publicado_em, criado_em, documento_tipos(nome), pessoas(nome)",
    )
    .order("criado_em", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((d) => ({
    id: d.id,
    titulo: d.titulo,
    tipo_nome: d.documento_tipos?.nome ?? "—",
    escopo: d.escopo,
    // `null` também quando a RLS de `pessoas` não deixa ver o nome.
    pessoa_nome: d.pessoas?.nome ?? null,
    versao: d.versao,
    status: d.status,
    prazo_ciencia: d.prazo_ciencia,
    publicado_em: d.publicado_em,
    criado_em: d.criado_em,
  }));
}

export type PublicoDoDocumento = {
  contrato_numero: string | null;
  unidade_nome: string | null;
  funcao: string | null;
};

export type VersaoDoDocumento = {
  id: string;
  versao: number;
  status: StatusDocumento;
  publicado_em: string | null;
};

export type ResumoDeCiencia = {
  destinatarios: number;
  confirmadas: number;
  divergencias: number;
};

export type Documento = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoDocumento;
  escopo: "individual" | "coletivo";
  pessoa_id: string | null;
  pessoa_nome: string | null;
  publicos: PublicoDoDocumento[];
  versao: number;
  substitui_id: string | null;
  status: StatusDocumento;
  arquivo_hash: string;
  arquivo_bytes: number | null;
  prazo_ciencia: string | null;
  publicado_em: string | null;
  publicado_por_nome: string | null;
  criado_em: string;
  /** Cadeia de versões, da mais nova para a mais antiga, só com o que a RLS mostra. */
  versoes: VersaoDoDocumento[];
  /** Só para publicado e arquivado; rascunho não alcança ninguém ainda. */
  resumo: ResumoDeCiencia | null;
};

/**
 * Documento completo, ou `null` se não existe — ou se a RLS não deixa ver,
 * que para a tela é a mesma coisa.
 */
export async function buscarDocumento(id: string): Promise<Documento | null> {
  const supabase = await criarClienteServidor();

  const { data: d, error } = await supabase
    .from("documentos")
    .select(
      `id, titulo, descricao, escopo, pessoa_id, versao, substitui_id, status, arquivo_hash,
       arquivo_bytes, prazo_ciencia, publicado_em, criado_em,
       documento_tipos(id, chave, nome, categoria, exige_ciencia, exige_2fa, prazo_ciencia_dias),
       pessoas(nome),
       usuarios!documentos_publicado_por_fkey(nome),
       documento_destinatarios(funcao, contratos(numero), unidades(nome))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!d || !d.documento_tipos) return null;

  const [versoes, resumo] = await Promise.all([
    cadeiaDeVersoes({
      id: d.id,
      versao: d.versao,
      status: d.status,
      publicado_em: d.publicado_em,
      substitui_id: d.substitui_id,
    }),
    d.status === "rascunho" ? Promise.resolve(null) : resumoDeCiencia(d.id),
  ]);

  return {
    id: d.id,
    titulo: d.titulo,
    descricao: d.descricao,
    tipo: d.documento_tipos,
    escopo: d.escopo,
    pessoa_id: d.pessoa_id,
    pessoa_nome: d.pessoas?.nome ?? null,
    publicos: (d.documento_destinatarios ?? []).map((p) => ({
      contrato_numero: p.contratos?.numero ?? null,
      unidade_nome: p.unidades?.nome ?? null,
      funcao: p.funcao,
    })),
    versao: d.versao,
    substitui_id: d.substitui_id,
    status: d.status,
    arquivo_hash: d.arquivo_hash,
    arquivo_bytes: d.arquivo_bytes,
    prazo_ciencia: d.prazo_ciencia,
    publicado_em: d.publicado_em,
    publicado_por_nome: d.usuarios?.nome ?? null,
    criado_em: d.criado_em,
    versoes,
    resumo,
  };
}

/**
 * Anda pela cadeia `substitui_id` nos dois sentidos.
 *
 * Uma consulta por passo, mas a cadeia é curta — retificação é exceção — e o
 * índice único de `substitui_id` (0015) garante que ela não se ramifica.
 */
async function cadeiaDeVersoes(
  proprio: VersaoDoDocumento & { substitui_id: string | null },
): Promise<VersaoDoDocumento[]> {
  const supabase = await criarClienteServidor();
  const campos = "id, versao, status, publicado_em, substitui_id";
  const cadeia: VersaoDoDocumento[] = [];

  // Para trás: as versões que este documento substitui.
  let anterior = proprio.substitui_id;
  while (anterior) {
    const { data } = await supabase.from("documentos").select(campos).eq("id", anterior).maybeSingle();
    if (!data) break;
    cadeia.push(data);
    anterior = data.substitui_id;
  }

  // Para frente: a versão que substitui este, e assim por diante.
  const posteriores: VersaoDoDocumento[] = [];
  let atual = proprio.id;
  for (;;) {
    const { data } = await supabase
      .from("documentos")
      .select(campos)
      .eq("substitui_id", atual)
      .maybeSingle();
    if (!data) break;
    posteriores.unshift(data);
    atual = data.id;
  }

  return [...posteriores, proprio, ...cadeia].map((v) => ({
    id: v.id,
    versao: v.versao,
    status: v.status,
    publicado_em: v.publicado_em,
  }));
}

async function resumoDeCiencia(id: string): Promise<ResumoDeCiencia | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("resumo_do_documento", { p_documento: id });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export type OpcoesDePublicacao = {
  tipos: TipoDocumento[];
  pessoas: { id: string; nome: string; cpf: string }[];
  contratos: ContratoComUnidades[];
  funcoes: string[];
};

/**
 * O que o formulário oferece.
 *
 * Tipos: só os de categoria que o usuário pode usar (`categorias_permitidas`,
 * que pergunta a `app.categoria_permitida` — a regra não é repetida aqui).
 * Oferecer holerite a quem não pode publicá-lo só renderia um erro no fim.
 * Pessoas: ativas e visíveis pela RLS. Funções: as que existem em alocação
 * vigente, para o público não ser escrito à mão com grafia diferente.
 */
export async function opcoesDePublicacao(): Promise<OpcoesDePublicacao> {
  const supabase = await criarClienteServidor();

  const [tipos, categorias, pessoas, contratos, alocacoes] = await Promise.all([
    supabase
      .from("documento_tipos")
      .select("id, chave, nome, categoria, exige_ciencia, exige_2fa, prazo_ciencia_dias")
      .order("nome"),
    supabase.rpc("categorias_permitidas"),
    supabase.from("pessoas").select("id, nome, cpf").eq("status", "ativo").order("nome"),
    contratosParaAlocacao(),
    supabase.from("alocacoes").select("funcao").neq("status", "encerrada"),
  ]);

  for (const r of [tipos, categorias, pessoas, alocacoes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const permitidas = new Set(categorias.data ?? []);

  return {
    tipos: (tipos.data ?? []).filter(
      (t) => permitidas.has(t.categoria) && !FORA_DA_TELA_DE_PUBLICACAO.has(t.chave),
    ),
    pessoas: pessoas.data ?? [],
    contratos,
    funcoes: [...new Set((alocacoes.data ?? []).map((a) => a.funcao))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
  };
}
