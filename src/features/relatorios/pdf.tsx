import "server-only";

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { dataHoraBrasilia } from "@/features/documentos/comprovante";

import type { Relatorio, Tabela } from "./relatorio";

/**
 * PDF de relatório (F5.3): A4 deitado, resumo e detalhe, e no rodapé quem
 * gerou, quando e o recorte — o papel que sai do sistema diz de onde veio.
 * Gerado sob demanda, nunca armazenado.
 *
 * PDF é para ler e anexar, não para trabalhar o dado: acima de LIMITE_PDF
 * linhas de detalhe a rota recusa e aponta o CSV.
 */

export const LIMITE_PDF = 2_000;

const estilos = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 32, fontFamily: "Helvetica", fontSize: 8, color: "#1A1D21" },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  subtitulo: { fontSize: 9, color: "#5B6570", marginTop: 2, marginBottom: 12 },
  secao: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  cabecalho: { flexDirection: "row", backgroundColor: "#F6F7F8", borderBottomWidth: 1, borderBottomColor: "#DDE1E6" },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DDE1E6" },
  celula: { flex: 1, paddingVertical: 3, paddingHorizontal: 3 },
  celulaCabecalho: { flex: 1, paddingVertical: 3, paddingHorizontal: 3, fontFamily: "Helvetica-Bold" },
  rodape: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: "#DDE1E6",
    paddingTop: 6,
    fontSize: 7,
    color: "#5B6570",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function TabelaPdf({ tabela }: { tabela: Tabela }) {
  return (
    <View>
      <View style={estilos.cabecalho} fixed>
        {tabela.colunas.map((c) => (
          <Text key={c} style={estilos.celulaCabecalho}>
            {c}
          </Text>
        ))}
      </View>
      {tabela.linhas.map((l, i) => (
        <View key={i} style={estilos.linha} wrap={false}>
          {l.map((v, j) => (
            <Text key={j} style={estilos.celula}>
              {v === null ? "—" : String(v)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export async function gerarPdfRelatorio(
  r: Relatorio,
  quem: { nome: string; organizacao: string },
  geradoEm = new Date(),
): Promise<Buffer> {
  const documento = (
    <Document title={r.titulo} author={quem.organizacao} creator="Portal 3e" producer="Portal 3e">
      <Page size="A4" orientation="landscape" style={estilos.pagina}>
        <Text style={estilos.titulo}>{r.titulo}</Text>
        <Text style={estilos.subtitulo}>
          {quem.organizacao} · {r.recorte} · {r.total.valor} {r.total.rotulo}
        </Text>
        {r.resumo && r.resumo.linhas.length > 0 ? (
          <>
            <Text style={estilos.secao}>Resumo</Text>
            <TabelaPdf tabela={r.resumo} />
          </>
        ) : null}
        <Text style={estilos.secao}>Detalhe</Text>
        {r.detalhe.linhas.length === 0 ? <Text>Nenhum registro no recorte.</Text> : <TabelaPdf tabela={r.detalhe} />}
        <View style={estilos.rodape} fixed>
          <Text>
            Gerado por {quem.nome} em {dataHoraBrasilia(geradoEm)}. Exportação registrada na auditoria do Portal.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(documento);
}
