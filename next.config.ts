import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `exceljs` é CommonJS e carrega streams do Node. Empacotá-lo no bundle do
  // servidor rende avisos e build lenta sem ganho nenhum — ele só roda no
  // servidor mesmo (F1.3: leitura da planilha de importação).
  // `@react-pdf/renderer` pelo mesmo motivo: gera o comprovante (F3.5) só no
  // servidor, com fontes e streams do Node.
  serverExternalPackages: ["exceljs", "@react-pdf/renderer"],

  experimental: {
    serverActions: {
      // A planilha do quadro chega por Server Action, e o padrão do Next é
      // 1MB. Um XLSX com o quadro inteiro passa disso com folga; o limite
      // continua existindo para não virar porta de upload arbitrário.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
