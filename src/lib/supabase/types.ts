export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alocacoes: {
        Row: {
          atualizado_em: string
          contrato_id: string
          criado_em: string
          data_fim: string | null
          data_inicio: string
          funcao: string
          id: string
          org_id: string
          pessoa_id: string
          status: Database["public"]["Enums"]["status_alocacao"]
          unidade_id: string
        }
        Insert: {
          atualizado_em?: string
          contrato_id: string
          criado_em?: string
          data_fim?: string | null
          data_inicio: string
          funcao: string
          id?: string
          org_id: string
          pessoa_id: string
          status?: Database["public"]["Enums"]["status_alocacao"]
          unidade_id: string
        }
        Update: {
          atualizado_em?: string
          contrato_id?: string
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string
          funcao?: string
          id?: string
          org_id?: string
          pessoa_id?: string
          status?: Database["public"]["Enums"]["status_alocacao"]
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alocacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alocacoes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos: {
        Row: {
          arquivo_path: string
          bytes: number | null
          criado_em: string
          enviado_por: string
          id: string
          mime: string | null
          nome: string
          org_id: string
          solicitacao_id: string | null
        }
        Insert: {
          arquivo_path: string
          bytes?: number | null
          criado_em?: string
          enviado_por: string
          id?: string
          mime?: string | null
          nome: string
          org_id: string
          solicitacao_id?: string | null
        }
        Update: {
          arquivo_path?: string
          bytes?: number | null
          criado_em?: string
          enviado_por?: string
          id?: string
          mime?: string | null
          nome?: string
          org_id?: string
          solicitacao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          criado_em: string
          detalhes: Json | null
          entidade: string
          entidade_id: string | null
          id: number
          ip: unknown
          org_id: string | null
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          detalhes?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: number
          ip?: unknown
          org_id?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          detalhes?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: number
          ip?: unknown
          org_id?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      ciencias: {
        Row: {
          documento_hash: string
          documento_id: string
          documento_versao: number
          id: string
          ip: unknown
          justificativa: string | null
          org_id: string
          pessoa_id: string
          protocolo: string
          respondido_em: string
          tipo: Database["public"]["Enums"]["tipo_ciencia"]
          user_agent: string | null
          usuario_id: string
        }
        Insert: {
          documento_hash: string
          documento_id: string
          documento_versao: number
          id?: string
          ip?: unknown
          justificativa?: string | null
          org_id: string
          pessoa_id: string
          protocolo?: string
          respondido_em?: string
          tipo: Database["public"]["Enums"]["tipo_ciencia"]
          user_agent?: string | null
          usuario_id: string
        }
        Update: {
          documento_hash?: string
          documento_id?: string
          documento_versao?: number
          id?: string
          ip?: unknown
          justificativa?: string | null
          org_id?: string
          pessoa_id?: string
          protocolo?: string
          respondido_em?: string
          tipo?: Database["public"]["Enums"]["tipo_ciencia"]
          user_agent?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ciencias_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciencias_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciencias_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciencias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_verificacao: {
        Row: {
          codigo_hash: string
          criado_em: string
          expira_em: string
          finalidade: string
          id: string
          tentativas: number
          usado_em: string | null
          usuario_id: string
        }
        Insert: {
          codigo_hash: string
          criado_em?: string
          expira_em: string
          finalidade: string
          id?: string
          tentativas?: number
          usado_em?: string | null
          usuario_id: string
        }
        Update: {
          codigo_hash?: string
          criado_em?: string
          expira_em?: string
          finalidade?: string
          id?: string
          tentativas?: number
          usado_em?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "codigos_verificacao_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contratantes: {
        Row: {
          atualizado_em: string
          cnpj: string | null
          criado_em: string
          id: string
          nome: string
          org_id: string
          status: Database["public"]["Enums"]["status_generico"]
        }
        Insert: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          id?: string
          nome: string
          org_id: string
          status?: Database["public"]["Enums"]["status_generico"]
        }
        Update: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          id?: string
          nome?: string
          org_id?: string
          status?: Database["public"]["Enums"]["status_generico"]
        }
        Relationships: [
          {
            foreignKeyName: "contratantes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_unidades: {
        Row: {
          contrato_id: string
          unidade_id: string
        }
        Insert: {
          contrato_id: string
          unidade_id: string
        }
        Update: {
          contrato_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_unidades_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          atualizado_em: string
          contratante_id: string
          criado_em: string
          descricao: string | null
          id: string
          numero: string
          org_id: string
          status: Database["public"]["Enums"]["status_generico"]
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          atualizado_em?: string
          contratante_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          numero: string
          org_id: string
          status?: Database["public"]["Enums"]["status_generico"]
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          atualizado_em?: string
          contratante_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          numero?: string
          org_id?: string
          status?: Database["public"]["Enums"]["status_generico"]
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_contratante_id_fkey"
            columns: ["contratante_id"]
            isOneToOne: false
            referencedRelation: "contratantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_destinatarios: {
        Row: {
          contrato_id: string | null
          documento_id: string
          funcao: string | null
          id: string
          unidade_id: string | null
        }
        Insert: {
          contrato_id?: string | null
          documento_id: string
          funcao?: string | null
          id?: string
          unidade_id?: string | null
        }
        Update: {
          contrato_id?: string | null
          documento_id?: string
          funcao?: string | null
          id?: string
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documento_destinatarios_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_destinatarios_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_destinatarios_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_tipos: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_doc"]
          chave: string
          criado_em: string
          exige_2fa: boolean
          exige_ciencia: boolean
          id: string
          nome: string
          org_id: string
          retencao_meses: number | null
        }
        Insert: {
          categoria: Database["public"]["Enums"]["categoria_doc"]
          chave: string
          criado_em?: string
          exige_2fa?: boolean
          exige_ciencia?: boolean
          id?: string
          nome: string
          org_id: string
          retencao_meses?: number | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_doc"]
          chave?: string
          criado_em?: string
          exige_2fa?: boolean
          exige_ciencia?: boolean
          id?: string
          nome?: string
          org_id?: string
          retencao_meses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documento_tipos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          arquivo_bytes: number | null
          arquivo_hash: string
          arquivo_path: string
          atualizado_em: string
          competencia: string | null
          criado_em: string
          descricao: string | null
          escopo: Database["public"]["Enums"]["escopo_documento"]
          id: string
          org_id: string
          pessoa_id: string | null
          prazo_ciencia: string | null
          publicado_em: string | null
          publicado_por: string | null
          status: Database["public"]["Enums"]["status_documento"]
          substitui_id: string | null
          tipo_id: string
          titulo: string
          versao: number
        }
        Insert: {
          arquivo_bytes?: number | null
          arquivo_hash: string
          arquivo_path: string
          atualizado_em?: string
          competencia?: string | null
          criado_em?: string
          descricao?: string | null
          escopo: Database["public"]["Enums"]["escopo_documento"]
          id?: string
          org_id: string
          pessoa_id?: string | null
          prazo_ciencia?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          status?: Database["public"]["Enums"]["status_documento"]
          substitui_id?: string | null
          tipo_id: string
          titulo: string
          versao?: number
        }
        Update: {
          arquivo_bytes?: number | null
          arquivo_hash?: string
          arquivo_path?: string
          atualizado_em?: string
          competencia?: string | null
          criado_em?: string
          descricao?: string | null
          escopo?: Database["public"]["Enums"]["escopo_documento"]
          id?: string
          org_id?: string
          pessoa_id?: string | null
          prazo_ciencia?: string | null
          publicado_em?: string | null
          publicado_por?: string | null
          status?: Database["public"]["Enums"]["status_documento"]
          substitui_id?: string | null
          tipo_id?: string
          titulo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_substitui_id_fkey"
            columns: ["substitui_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "documento_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          assunto: string
          canal: string
          corpo: string | null
          criado_em: string
          enviada_em: string | null
          id: string
          lida_em: string | null
          org_id: string
          referencia_id: string | null
          referencia_tipo: string | null
          status: string
          usuario_id: string
        }
        Insert: {
          assunto: string
          canal: string
          corpo?: string | null
          criado_em?: string
          enviada_em?: string | null
          id?: string
          lida_em?: string | null
          org_id: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          status?: string
          usuario_id: string
        }
        Update: {
          assunto?: string
          canal?: string
          corpo?: string | null
          criado_em?: string
          enviada_em?: string | null
          id?: string
          lida_em?: string | null
          org_id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          status?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacoes: {
        Row: {
          atualizado_em: string
          cnpj: string
          criado_em: string
          id: string
          nome: string
          slug: string
          status: Database["public"]["Enums"]["status_generico"]
        }
        Insert: {
          atualizado_em?: string
          cnpj: string
          criado_em?: string
          id?: string
          nome: string
          slug: string
          status?: Database["public"]["Enums"]["status_generico"]
        }
        Update: {
          atualizado_em?: string
          cnpj?: string
          criado_em?: string
          id?: string
          nome?: string
          slug?: string
          status?: Database["public"]["Enums"]["status_generico"]
        }
        Relationships: []
      }
      perfil_categorias: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_doc"]
          perfil_id: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["categoria_doc"]
          perfil_id: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_doc"]
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_categorias_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_permissoes: {
        Row: {
          acao: string
          modulo: string
          perfil_id: string
        }
        Insert: {
          acao: string
          modulo: string
          perfil_id: string
        }
        Update: {
          acao?: string
          modulo?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          aplica_a: Database["public"]["Enums"]["tipo_usuario"]
          chave: string
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          org_id: string
        }
        Insert: {
          aplica_a: Database["public"]["Enums"]["tipo_usuario"]
          chave: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          org_id: string
        }
        Update: {
          aplica_a?: Database["public"]["Enums"]["tipo_usuario"]
          chave?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          atualizado_em: string
          cpf: string
          criado_em: string
          data_nascimento: string | null
          email_pessoal: string | null
          endereco: string | null
          foto_path: string | null
          id: string
          matricula: string | null
          nome: string
          org_id: string
          status: Database["public"]["Enums"]["status_generico"]
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          cpf: string
          criado_em?: string
          data_nascimento?: string | null
          email_pessoal?: string | null
          endereco?: string | null
          foto_path?: string | null
          id?: string
          matricula?: string | null
          nome: string
          org_id: string
          status?: Database["public"]["Enums"]["status_generico"]
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          cpf?: string
          criado_em?: string
          data_nascimento?: string | null
          email_pessoal?: string | null
          endereco?: string | null
          foto_path?: string | null
          id?: string
          matricula?: string | null
          nome?: string
          org_id?: string
          status?: Database["public"]["Enums"]["status_generico"]
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacao_eventos: {
        Row: {
          conteudo: string | null
          criado_em: string
          id: string
          interno: boolean
          solicitacao_id: string
          status_anterior:
            | Database["public"]["Enums"]["status_solicitacao"]
            | null
          status_novo: Database["public"]["Enums"]["status_solicitacao"] | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          conteudo?: string | null
          criado_em?: string
          id?: string
          interno?: boolean
          solicitacao_id: string
          status_anterior?:
            | Database["public"]["Enums"]["status_solicitacao"]
            | null
          status_novo?: Database["public"]["Enums"]["status_solicitacao"] | null
          tipo: string
          usuario_id: string
        }
        Update: {
          conteudo?: string | null
          criado_em?: string
          id?: string
          interno?: boolean
          solicitacao_id?: string
          status_anterior?:
            | Database["public"]["Enums"]["status_solicitacao"]
            | null
          status_novo?: Database["public"]["Enums"]["status_solicitacao"] | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacao_eventos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes: {
        Row: {
          aberta_por: string
          atualizado_em: string
          concluida_em: string | null
          contrato_id: string | null
          criado_em: string
          descricao: string | null
          documento_id: string | null
          id: string
          org_id: string
          pessoa_id: string | null
          prazo: string | null
          protocolo: string
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_solicitacao"]
          tipo: Database["public"]["Enums"]["tipo_solicitacao"]
          titulo: string
          unidade_id: string | null
        }
        Insert: {
          aberta_por: string
          atualizado_em?: string
          concluida_em?: string | null
          contrato_id?: string | null
          criado_em?: string
          descricao?: string | null
          documento_id?: string | null
          id?: string
          org_id: string
          pessoa_id?: string | null
          prazo?: string | null
          protocolo?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao"]
          tipo: Database["public"]["Enums"]["tipo_solicitacao"]
          titulo: string
          unidade_id?: string | null
        }
        Update: {
          aberta_por?: string
          atualizado_em?: string
          concluida_em?: string | null
          contrato_id?: string | null
          criado_em?: string
          descricao?: string | null
          documento_id?: string | null
          id?: string
          org_id?: string
          pessoa_id?: string | null
          prazo?: string | null
          protocolo?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao"]
          tipo?: Database["public"]["Enums"]["tipo_solicitacao"]
          titulo?: string
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_aberta_por_fkey"
            columns: ["aberta_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          atualizado_em: string
          cidade: string | null
          contratante_id: string
          criado_em: string
          endereco: string | null
          id: string
          nome: string
          org_id: string
          status: Database["public"]["Enums"]["status_generico"]
          uf: string | null
        }
        Insert: {
          atualizado_em?: string
          cidade?: string | null
          contratante_id: string
          criado_em?: string
          endereco?: string | null
          id?: string
          nome: string
          org_id: string
          status?: Database["public"]["Enums"]["status_generico"]
          uf?: string | null
        }
        Update: {
          atualizado_em?: string
          cidade?: string | null
          contratante_id?: string
          criado_em?: string
          endereco?: string | null
          id?: string
          nome?: string
          org_id?: string
          status?: Database["public"]["Enums"]["status_generico"]
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_contratante_id_fkey"
            columns: ["contratante_id"]
            isOneToOne: false
            referencedRelation: "contratantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_escopos: {
        Row: {
          contrato_id: string | null
          criado_em: string
          id: string
          unidade_id: string | null
          usuario_id: string
        }
        Insert: {
          contrato_id?: string | null
          criado_em?: string
          id?: string
          unidade_id?: string | null
          usuario_id: string
        }
        Update: {
          contrato_id?: string | null
          criado_em?: string
          id?: string
          unidade_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_escopos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_escopos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_escopos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_perfis: {
        Row: {
          perfil_id: string
          usuario_id: string
        }
        Insert: {
          perfil_id: string
          usuario_id: string
        }
        Update: {
          perfil_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_perfis_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_perfis_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          atualizado_em: string
          criado_em: string
          email_login: string
          id: string
          nome: string
          org_id: string
          pessoa_id: string | null
          precisa_trocar_senha: boolean
          status: Database["public"]["Enums"]["status_generico"]
          telefone: string | null
          tipo: Database["public"]["Enums"]["tipo_usuario"]
          ultimo_acesso: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          email_login: string
          id: string
          nome: string
          org_id: string
          pessoa_id?: string | null
          precisa_trocar_senha?: boolean
          status?: Database["public"]["Enums"]["status_generico"]
          telefone?: string | null
          tipo: Database["public"]["Enums"]["tipo_usuario"]
          ultimo_acesso?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          email_login?: string
          id?: string
          nome?: string
          org_id?: string
          pessoa_id?: string | null
          precisa_trocar_senha?: boolean
          status?: Database["public"]["Enums"]["status_generico"]
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["tipo_usuario"]
          ultimo_acesso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auditoria_opcoes_de_filtro: {
        Args: never
        Returns: {
          campo: string
          valor: string
        }[]
      }
      importar_pessoas: { Args: { p_linhas: Json }; Returns: Json }
    }
    Enums: {
      categoria_doc:
        | "geral"
        | "contratual"
        | "sst"
        | "pessoal"
        | "medico"
        | "bancario"
        | "folha"
        | "jornada"
      escopo_documento: "individual" | "coletivo"
      status_alocacao: "ativa" | "afastado" | "ferias" | "encerrada"
      status_documento: "rascunho" | "publicado" | "arquivado"
      status_generico: "ativo" | "inativo" | "arquivado"
      status_solicitacao:
        | "aberta"
        | "em_analise"
        | "pendente_solicitante"
        | "aprovada"
        | "recusada"
        | "concluida"
        | "cancelada"
      tipo_ciencia: "confirmacao" | "divergencia"
      tipo_solicitacao:
        | "ferias"
        | "afastamento"
        | "correcao_ponto"
        | "substituicao"
        | "atualizacao_cadastral"
        | "ocorrencia"
        | "suporte"
        | "outro"
      tipo_usuario: "funcionario" | "contratante" | "interno"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      categoria_doc: [
        "geral",
        "contratual",
        "sst",
        "pessoal",
        "medico",
        "bancario",
        "folha",
        "jornada",
      ],
      escopo_documento: ["individual", "coletivo"],
      status_alocacao: ["ativa", "afastado", "ferias", "encerrada"],
      status_documento: ["rascunho", "publicado", "arquivado"],
      status_generico: ["ativo", "inativo", "arquivado"],
      status_solicitacao: [
        "aberta",
        "em_analise",
        "pendente_solicitante",
        "aprovada",
        "recusada",
        "concluida",
        "cancelada",
      ],
      tipo_ciencia: ["confirmacao", "divergencia"],
      tipo_solicitacao: [
        "ferias",
        "afastamento",
        "correcao_ponto",
        "substituicao",
        "atualizacao_cadastral",
        "ocorrencia",
        "suporte",
        "outro",
      ],
      tipo_usuario: ["funcionario", "contratante", "interno"],
    },
  },
} as const
