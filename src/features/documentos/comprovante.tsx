import "server-only";

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { formatarCnpj, mascararCpf } from "@/lib/cpf-cnpj";

/**
 * Comprovante de ciência em PDF (F3.5).
 *
 * Puro: recebe os dados já lidos (e já autorizados pela RLS, na rota) e
 * devolve os bytes. Gerado sob demanda e nunca armazenado — a prova é o
 * registro imutável em `ciencias`; o PDF é só a forma de levá-la embora.
 *
 * O que entra é o que docs/05 pede, e nada além: protocolo, nome e CPF
 * mascarado, título e versão, o hash sha256 que a ciência gravou, o tipo de
 * resposta, a justificativa se houver, data e hora em Brasília, e o CNPJ da
 * organização no rodapé. O hash é o **da ciência** (`documento_hash`), não o
 * do documento hoje: é o que prova a qual arquivo a pessoa respondeu.
 *
 * Fontes padrão do PDF (Helvetica, Courier): cobrem português (WinAnsi) e
 * não dependem de baixar fonte em tempo de geração.
 */

export type DadosDoComprovante = {
  protocolo: string;
  tipo: "confirmacao" | "divergencia";
  justificativa: string | null;
  respondidoEm: string;
  pessoa: { nome: string; cpf: string };
  documento: { titulo: string; tipoNome: string; versao: number; hash: string };
  organizacao: { nome: string; cnpj: string };
  geradoEm?: Date;
};

const FUSO = "America/Sao_Paulo";

export function dataHoraBrasilia(instante: Date): string {
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short" }).format(instante);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(instante);
  return `${data} às ${hora} (horário de Brasília)`;
}

const estilos = StyleSheet.create({
  pagina: { paddingTop: 48, paddingBottom: 72, paddingHorizontal: 56, fontFamily: "Helvetica", fontSize: 10, color: "#1A1D21" },
  titulo: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitulo: { fontSize: 10, color: "#5B6570", marginBottom: 20 },
  protocoloRotulo: { fontSize: 9, color: "#5B6570" },
  protocolo: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 20, letterSpacing: 1 },
  bloco: { borderTopWidth: 1, borderTopColor: "#DDE1E6", paddingTop: 10, marginBottom: 14 },
  linha: { flexDirection: "row", marginBottom: 6 },
  rotulo: { width: 130, color: "#5B6570" },
  valor: { flex: 1 },
  hash: { flex: 1, fontFamily: "Courier", fontSize: 9 },
  justificativa: { marginTop: 2, padding: 8, backgroundColor: "#F6F7F8", lineHeight: 1.25 },
  rodape: {
    position: "absolute",
    bottom: 32,
    left: 56,
    right: 56,
    borderTopWidth: 1,
    borderTopColor: "#DDE1E6",
    paddingTop: 8,
    fontSize: 8,
    color: "#5B6570",
    lineHeight: 1.4,
  },
});

function Linha({ rotulo, valor, mono = false }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={mono ? estilos.hash : estilos.valor}>{valor}</Text>
    </View>
  );
}

function Comprovante({ dados }: { dados: DadosDoComprovante }) {
  const confirmou = dados.tipo === "confirmacao";
  const geradoEm = dados.geradoEm ?? new Date();

  return (
    <Document
      title={`Comprovante ${dados.protocolo}`}
      author={dados.organizacao.nome}
      creator="Portal 3e"
      producer="Portal 3e"
    >
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>
          {confirmou ? "Comprovante de ciência" : "Comprovante de divergência"}
        </Text>
        <Text style={estilos.subtitulo}>{dados.organizacao.nome}</Text>

        <Text style={estilos.protocoloRotulo}>Protocolo</Text>
        <Text style={estilos.protocolo}>{dados.protocolo}</Text>

        <View style={estilos.bloco}>
          <Linha rotulo="Funcionário" valor={dados.pessoa.nome} />
          <Linha rotulo="CPF" valor={mascararCpf(dados.pessoa.cpf)} />
        </View>

        <View style={estilos.bloco}>
          <Linha rotulo="Documento" valor={dados.documento.titulo} />
          <Linha rotulo="Tipo" valor={dados.documento.tipoNome} />
          <Linha rotulo="Versão" valor={String(dados.documento.versao)} />
          <Linha rotulo="Hash SHA-256 do arquivo" valor={dados.documento.hash} mono />
        </View>

        <View style={estilos.bloco}>
          <Linha
            rotulo="Resposta"
            valor={confirmou ? "Ciência confirmada" : "Divergência registrada"}
          />
          <Linha rotulo="Data e hora" valor={dataHoraBrasilia(new Date(dados.respondidoEm))} />
          {!confirmou && dados.justificativa ? (
            <View style={{ marginTop: 4 }}>
              <Text style={estilos.rotulo}>Justificativa</Text>
              <Text style={estilos.justificativa}>{dados.justificativa}</Text>
            </View>
          ) : null}
        </View>

        <View style={estilos.rodape} fixed>
          <Text>
            {dados.organizacao.nome} · CNPJ {formatarCnpj(dados.organizacao.cnpj)}
          </Text>
          <Text>
            Comprovante gerado em {dataHoraBrasilia(geradoEm)} a partir do registro de ciência
            no Portal 3e, que não pode ser alterado nem apagado. O hash identifica exatamente
            o arquivo a que a resposta se refere.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarComprovante(dados: DadosDoComprovante): Promise<Buffer> {
  return renderToBuffer(<Comprovante dados={dados} />);
}
