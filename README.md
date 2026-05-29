# Organizador IR – Saúde & Educação

Aplicativo local para centralizar e classificar despesas dedutíveis de IRPF de uma família, separando por declarante (titular e cônjuge) e por categoria (saúde e educação), com suporte a anexos de comprovantes.

## Como usar

### Opção 1 — Abrir direto no navegador (mais simples)
```bash
# macOS / Linux
open index.html

# Windows
start index.html
```

### Opção 2 — Com live-server (hot reload para desenvolvimento)
```bash
npm run dev
# Abre em http://localhost:3000
```

## Funcionalidades

- **Painel**: métricas gerais com split por titular e cônjuge
- **Despesas**: lista filtrável por categoria, pagador e beneficiário
- **Adicionar**: formulário com campo de reembolso e upload de anexos (JPG, PNG, PDF)
- **Documentos**: galeria unificada de todos os anexos classificados por categoria e declarante
- **Resumo IR**: visão pronta para preencher na ficha *Pagamentos Efetuados* do programa IRPF
- **Config**: nomes dos membros da família, ano-calendário e limite de educação
- **Relatório PDF**: Ctrl+P / Imprimir gera relatório A4 com tabela de despesas, resumo por declarante e miniaturas dos documentos
- **Export/Import JSON**: backup completo incluindo os arquivos anexados

## Regras de negócio

| Categoria  | Limite dedução | Obs |
|-----------|---------------|-----|
| Saúde     | Sem limite     | Descontar reembolsos recebidos do plano |
| Educação  | R$ 3.561,50/pessoa | Atualizar em `src/state.js` quando mudar |

## Estrutura

```
src/
├── style.css    # Variáveis CSS e todos os componentes
├── db.js        # IndexedDB (anexos)
├── state.js     # Estado global e configurações padrão
├── helpers.js   # Formatadores e utilitários
├── ui.js        # Render das abas dashboard, despesas, resumo
├── form.js      # Formulário de despesa e upload de arquivos
├── docs.js      # Aba documentos e lightbox
├── print.js     # Geração do relatório de impressão
└── io.js        # Export e import JSON
```

## Dados

Os dados ficam **100% no navegador**:
- Despesas e config → `localStorage`
- Arquivos/anexos → `IndexedDB`

Use **Exportar JSON** regularmente para backup. O arquivo exportado contém tudo (incluindo arquivos em base64) e pode ser importado em outro computador ou navegador.
