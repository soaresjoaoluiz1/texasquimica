# Migração Apps Script v1 → v2

## O que muda

**Novo formulário multi-step** com **6 campos qualificadores extras** + **CNPJ** + **form_version**.

## Colunas novas na planilha (8 colunas)

O script `Code-v2.gs` **migra automaticamente** ao rodar pela primeira vez. Ele insere as colunas novas nas posições certas SEM apagar dados.

### Ordem final das colunas (planilha `REVENDEDORES LP`)

| # | Coluna | v1 | v2 |
|---|---|---|---|
| A (1) | Timestamp | ✓ | ✓ |
| B (2) | Data/Hora BR | ✓ | ✓ |
| C (3) | Nome | ✓ | ✓ |
| D (4) | Empresa | ✓ | ✓ |
| E (5) | **CNPJ** | — | 🆕 |
| F (6) | E-mail | ✓ | ✓ (era col E) |
| G (7) | Telefone | ✓ | ✓ (era col F) |
| H (8) | Cidade | ✓ | ✓ (era col G) |
| I (9) | Estado | ✓ | ✓ (era col H) |
| J (10) | **Perfil Empresa** | — | 🆕 |
| K (11) | **Ja Comercializa** | — | 🆕 |
| L (12) | **Canal Vendas** | — | 🆕 |
| M (13) | **Volume Compra** | — | 🆕 |
| N (14) | **Prazo Pedido** | — | 🆕 |
| O (15) | **Cargo** | — | 🆕 |
| P (16) | Mensagem | ✓ | ✓ (era col I) |
| Q (17) | Fonte (normalizada) | ✓ | ✓ |
| R–X | utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, fbclid | ✓ | ✓ |
| Y (25) | URL | ✓ | ✓ |
| Z (26) | Referrer | ✓ | ✓ |
| AA (27) | User Agent | ✓ | ✓ |
| AB (28) | IP | ✓ | ✓ |
| AC (29) | **Form Version** | — | 🆕 (v1/v2) |
| AD (30) | CRM status | ✓ | ✓ |
| AE (31) | CRM resposta | ✓ | ✓ |

**Total:** 23 colunas (v1) → 31 colunas (v2). +8 colunas.

## Deploy passo a passo

### 1. Copia o novo código
Abre `apps-script/Code-v2.gs` deste repo e copia tudo.

### 2. Cola no Apps Script
- Abre a planilha `ENTRADA DE LEADS - TEXAS QUIMICA | DROS AGENCIA`
- `Extensões → Apps Script`
- Substitui todo o conteúdo de `Code.gs` pelo do `Code-v2.gs`
- Salva (Ctrl+S)

### 3. Testa manualmente
- Na barra de funções (topo do Apps Script), seleciona `testLead`
- Clica em `Executar`
- Autoriza permissões se pedir
- Confere:
  - Aba `REVENDEDORES LP` deve ter 8 colunas novas inseridas nos lugares certos
  - Última linha da planilha deve ter os dados do teste preenchidos
  - Coluna `CRM status` deve mostrar `200`
  - Coluna `CRM resposta` deve mostrar `{"ok":true,"leadId":XXXX,...}`

### 4. Publica nova versão
- `Deploy → Gerenciar deploys`
- Clica no ícone de lápis (editar) do deploy atual
- Em "Versão", seleciona **Nova versão**
- Descreve: `v2 - form multi-step qualificado (CNPJ + 6 campos + form_version)`
- Salva

**URL do web app permanece a mesma** — o site v2.html já aponta pra ela.

## Impacto no CRM

Os campos qualificadores vão pro campo `source_detail` do lead no CRM, aparecendo no card assim:

```
Perfil: Loja de produtos automotivos | Ja vende: Sim, mas queremos ampliar |
Canal: Loja física e vendas online | Volume: De R$ 10.000 a R$ 19.999 |
Prazo: Nos próximos 15 dias | Cargo: Proprietário ou sócio
```

E **tags automáticas** são criadas pra filtrar rápido:
- `Perfil: Loja` ou `Perfil: Distribuidora`
- `Volume 5-10k` / `Volume 10-20k` / `Volume 20-50k` / `Volume 50k+`
- `Prazo: Urgente` / `Prazo: 15 dias` / `Prazo: 30 dias` / `Prazo: Avaliando`
- `Landing Page Revendedores`

## Compatibilidade retroativa

O v2 continua funcionando se o site enviar payload v1 (sem os campos novos) — os campos ficam vazios. Assim se algum lead antigo cachear a página v1, ainda é processado.

## Rollback

Se algo der errado, é só voltar o código pro `Code.gs` original (v1). As colunas novas na planilha ficam vazias mas não atrapalham o fluxo v1.
