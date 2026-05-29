# Organizador IR – Saúde & Educação

## O que é este projeto

Aplicativo web local (HTML + CSS + JS puro, sem framework, sem build step) para centralizar e organizar despesas dedutíveis de Imposto de Renda — saúde e educação — de uma família com dois declarantes (titular e cônjuge) e um filho dependente.

Roda diretamente no navegador abrindo o `index.html`. Não precisa de servidor, Node, nem internet.

## Arquitetura

```
ir-project/
├── index.html          # Entry point — estrutura HTML e imports
├── src/
│   ├── style.css       # Todo o CSS (variáveis, componentes, print)
│   ├── db.js           # Camada IndexedDB (openDB, dbPut, dbGet, dbDel, dbAll)
│   ├── state.js        # Estado global: despesas[], cfg{}, pendingFiles[]
│   ├── helpers.js      # Formatadores, utilitários puros (brl, fmtDate, escH…)
│   ├── ui.js           # Render functions por tab (renderDashboard, renderDespesas…)
│   ├── form.js         # Lógica do formulário (saveDespesa, editDespesa, handleFiles…)
│   ├── docs.js         # Aba Documentos + Lightbox
│   ├── print.js        # Geração do relatório PDF/impressão
│   └── io.js           # Export/Import JSON
├── CLAUDE.md
├── README.md
└── package.json        # Só scripts de dev (live-server), sem dependências de build
```

## Domínio de negócio — regras importantes

- **Saúde**: dedutível sem limite no IRPF. Deve subtrair reembolsos recebidos do plano.
- **Educação**: limite legal de R$ 3.561,50 por pessoa (atualizar em `state.js → DEFAULT_LIMITE_EDUC` quando a Receita publicar novo valor).
- **Pagador vs. Beneficiário**: uma despesa pode ser paga pelo titular mas beneficiar o filho. O campo `pagador` determina em qual declaração entra; `beneficiario` é informativo e aparece nos relatórios.
- **Reembolso do plano**: o valor dedutível é `valor - reembolso`. Nunca pode ser negativo.
- **Dependente filho**: despesas do filho vão na declaração de quem o declarar como dependente — pode ser titular OU cônjuge, não ambos.

## Persistência

- **Metadados das despesas**: `localStorage` com chave `ir_despesas_v3`
- **Configurações**: `localStorage` com chave `ir_config_v2`
- **Arquivos/anexos**: `IndexedDB` banco `ir_att`, store `files`, keyPath `id`
- O backup JSON exporta os dois (`despesas` + `attachments` com dataUrl base64)

## Convenções de código

- Vanilla JS, sem TypeScript, sem bundler
- Módulos via `<script type="module">` no `index.html`
- Estado mutable centralizado em `state.js` — funções de render leem de lá
- Nomes de IDs HTML: prefixo por contexto (`f-` form, `ff-` filter-despesas, `df-` filter-docs, `cfg-` config)
- CSS: só variáveis `var(--*)` para cores — facilita dark mode futuro
- Sempre usar `escH()` antes de inserir string do usuário no innerHTML

## Comandos de desenvolvimento

```bash
npm run dev      # live-server na porta 3000
npm run open     # abre index.html direto no navegador (sem servidor)
```

## O que NÃO existe (e não deve ser adicionado sem discussão)

- Autenticação / contas de usuário
- Backend / banco de dados remoto
- Build step (webpack, vite, etc.) — o projeto deve rodar abrindo o HTML
- Framework JS (React, Vue) — vanilla por design para máxima portabilidade

## Próximas features discutidas

- [ ] Múltiplos anos-calendário na mesma instalação
- [ ] Dark mode
- [ ] Campo para informar qual filho é dependente de qual declarante (útil para casais que declaram separado)
- [ ] Importação de extratos CSV do plano de saúde
