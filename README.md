# Texas Química — LP Revendedor

Landing page de captação de revendedores da Texas Química.

## Deploy

- Repositório: `github.com/soaresjoaoluiz1/texasquimica-lp-revendedor`
- Hospedagem: HostGator VPS Platinum (162.214.146.220)
- Subdomínio: **revendedor.texasquimica.com.br**
- cPanel user: `texasquimica`
- Path servidor: `~/public_html/`

## Deploy no cPanel (comando padrão)

```bash
cd ~/public_html
git fetch origin main
git reset --hard origin/main
git log -1 --oneline
```

## Estrutura

- `index.html` — landing page principal
- `obrigado.html` — página de agradecimento pós-form (ou obrigado-sim.html / obrigado-nao.html se tiver qualificação)
- `assets/` — imagens, css, js
- `apps-script-setup.md` — instruções de setup do Google Apps Script
- `apps-script-v2.js` — código do Apps Script que integra com CRM
- `SEO-PLAN.md` — plano de SEO
- `robots.txt` + `sitemap.xml` — SEO técnico

## Trackers

- Meta Pixel: [ID a definir]
- Google Analytics 4: [ID a definir]

## Formulário

- Endpoint Apps Script: [URL /exec a definir após publicar Web App]
- Planilha: [link a criar]
- Integração CRM Sheraos: `gringa-cosm-ticos` [conta CRM a criar/definir]
