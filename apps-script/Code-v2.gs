/**
 * ENTRADA DE LEADS - TEXAS QUIMICA | DROS AGENCIA  (v2 - form multi-step qualificado)
 * Fluxo: Site (revendedor.texasquimica.com.br/v2.html) -> Apps Script -> Planilha + CRM Dros
 *
 * DIFERENCA v2 vs v1:
 *  - Novo campo CNPJ (obrigatorio)
 *  - 6 novos campos qualificadores do form multi-step:
 *      perfil_empresa, ja_comercializa, canal_vendas,
 *      volume_compra, prazo_pedido, cargo
 *  - Campo Mensagem REMOVIDO do form (mantido no header pra retrocompat com v1)
 *  - Envia detalhes qualificadores no source_detail do CRM
 *  - Adiciona tags automaticas por volume/perfil/prazo no CRM
 *
 * DEPLOY (mesmo processo do v1):
 *  1. Abre a planilha "ENTRADA DE LEADS - TEXAS QUIMICA | DROS AGENCIA"
 *  2. Extensoes -> Apps Script
 *  3. Cola este codigo em Code.gs (substitui tudo)
 *  4. Deploy -> Gerenciar deploys -> edita o deploy atual -> Nova versao
 *  5. Salva - URL do web app permanece igual, so troca a versao interna
 *
 * IMPORTANTE - COLUNAS NOVAS NA PLANILHA:
 *  Este script adiciona 7 colunas NOVAS entre "Mensagem" e "Fonte":
 *      CNPJ, Perfil Empresa, Ja Comercializa, Canal Vendas,
 *      Volume Compra, Prazo Pedido, Cargo
 *  Ele detecta se os headers ainda sao v1 (sem essas colunas) e insere
 *  automaticamente na ordem certa. Roda uma vez pra migrar.
 */

// ============= CONFIG =============
var SHEET_NAME = 'REVENDEDORES LP';
var CRM_URL    = 'https://drosagencia.com.br/crm/api/webhooks/sheets/texas-quimica-industria-e-comercio-de-produtos-quimicos-ltda';
var CRM_TOKEN  = '';
var LEAD_TAG   = 'Landing Page Revendedores';

var HEADERS = [
  'Timestamp',              //  1
  'Data/Hora BR',           //  2
  'Nome',                   //  3
  'Empresa',                //  4
  'CNPJ',                   //  5  NOVO v2
  'E-mail',                 //  6
  'Telefone',               //  7
  'Cidade',                 //  8
  'Estado',                 //  9
  'Perfil Empresa',         // 10  NOVO v2
  'Ja Comercializa',        // 11  NOVO v2
  'Canal Vendas',           // 12  NOVO v2
  'Volume Compra',          // 13  NOVO v2
  'Prazo Pedido',           // 14  NOVO v2
  'Cargo',                  // 15  NOVO v2
  'Mensagem',               // 16
  'Fonte (normalizada)',    // 17
  'utm_source',             // 18
  'utm_medium',             // 19
  'utm_campaign',           // 20
  'utm_content',            // 21
  'utm_term',               // 22
  'gclid',                  // 23
  'fbclid',                 // 24
  'URL',                    // 25
  'Referrer',               // 26
  'User Agent',             // 27
  'IP',                     // 28
  'Form Version',           // 29  NOVO v2
  'CRM status',             // 30
  'CRM resposta'            // 31
];

var CRM_STATUS_COL = HEADERS.indexOf('CRM status') + 1;   // 30
var CRM_BODY_COL   = HEADERS.indexOf('CRM resposta') + 1; // 31

// ============= WEBHOOK ENTRADA =============
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = ensureSheet_();

    var fonte = normalizeFonte_(data);
    var nowIso = new Date().toISOString();
    var nowBr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    var ip = (e && e.parameter && e.parameter.ip) || '';

    // Grava linha na planilha (ordem sincronizada com HEADERS)
    var row = [
      data.timestamp_iso || nowIso,
      nowBr,
      data.nome || '',
      data.empresa || '',
      data.cnpj || '',
      data.email || '',
      data.telefone || '',
      data.cidade || '',
      data.estado || '',
      data.perfil_empresa || '',
      data.ja_comercializa || '',
      data.canal_vendas || '',
      data.volume_compra || '',
      data.prazo_pedido || '',
      data.cargo || '',
      data.mensagem || '',
      fonte,
      data.utm_source || '',
      data.utm_medium || '',
      data.utm_campaign || '',
      data.utm_content || '',
      data.utm_term || '',
      data.gclid || '',
      data.fbclid || '',
      data.url || '',
      data.referrer || '',
      data.user_agent || '',
      ip,
      data.form_version || 'v1',
      'pendente',
      ''
    ];
    sheet.appendRow(row);
    var lastRow = sheet.getLastRow();

    // Envia pro CRM Dros com detalhes qualificados + tags
    var crmResult = sendToCRM_(data, fonte);
    sheet.getRange(lastRow, CRM_STATUS_COL).setValue(crmResult.status);
    sheet.getRange(lastRow, CRM_BODY_COL).setValue(crmResult.body);

    return jsonOut_({ ok: true, lead_id: lastRow, fonte: fonte, crm: crmResult });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err), stack: err.stack });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return jsonOut_({ ok: true, msg: 'Texas Quimica LP webhook rodando (v2)' });
}

// ============= GARANTE ABA + CABECALHO (com auto-migracao v1 -> v2) =============
function ensureSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  // Planilha nova: cria headers do zero
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
    return sheet;
  }

  // Helper: labels que precisam existir + posicao alvo NA v2 (ordem final)
  var inserts = [
    { pos:  5, label: 'CNPJ' },
    { pos: 10, label: 'Perfil Empresa' },
    { pos: 11, label: 'Ja Comercializa' },
    { pos: 12, label: 'Canal Vendas' },
    { pos: 13, label: 'Volume Compra' },
    { pos: 14, label: 'Prazo Pedido' },
    { pos: 15, label: 'Cargo' },
    { pos: 29, label: 'Form Version' }
  ];

  // Ja tem TODOS os labels novos? Nada a fazer.
  var currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var missing = inserts.filter(function(ins) {
    return currentHeaders.indexOf(ins.label) === -1;
  });
  if (missing.length === 0) return sheet;

  Logger.log('[migracao] Detectado schema v1, migrando pra v2. Faltam ' + missing.length + ' colunas');

  // Insere em ORDEM REVERSA de posicao pra evitar deslocar posicoes menores
  // (insercao em pos alta primeiro; pos baixa por ultimo)
  var revMissing = missing.slice().sort(function(a, b) { return b.pos - a.pos; });

  revMissing.forEach(function(ins) {
    var curLastCol = sheet.getLastColumn();
    Logger.log('[migracao] Inserindo "' + ins.label + '" em pos ' + ins.pos + ' (lastCol atual=' + curLastCol + ')');

    if (ins.pos > curLastCol) {
      // Precisa estender a planilha ate ter (pos - 1) colunas, depois append
      while (sheet.getLastColumn() < ins.pos - 1) {
        sheet.insertColumnAfter(sheet.getLastColumn());
      }
      sheet.insertColumnAfter(sheet.getLastColumn());
    } else {
      // Coluna alvo existe; insere ANTES dela (desloca a atual pra frente)
      sheet.insertColumnBefore(ins.pos);
    }
    sheet.getRange(1, ins.pos).setValue(ins.label).setFontWeight('bold');
  });

  Logger.log('[migracao] Concluida. Total colunas: ' + sheet.getLastColumn());
  return sheet;
}

// ============= NORMALIZACAO DA FONTE (identico ao v1) =============
function normalizeFonte_(d) {
  var src = (d.utm_source || '').toLowerCase();
  var med = (d.utm_medium || '').toLowerCase();
  var camp = (d.utm_campaign || '').toLowerCase();
  var content = (d.utm_content || '').toLowerCase();
  var ref = (d.referrer || '').toLowerCase();
  var hasFbclid = !!d.fbclid;
  var hasGclid = !!d.gclid;

  if (src.indexOf('bio') !== -1 || src === 'linktree' || src === 'beacons' ||
      med === 'bio' || camp.indexOf('bio') !== -1 ||
      ref.indexOf('linktr.ee') !== -1 || ref.indexOf('beacons.') !== -1) {
    return 'link bio';
  }
  if (hasGclid || (src.indexOf('google') !== -1 && (med === 'cpc' || med === 'paid' || med === 'ads'))) {
    return 'google pago';
  }
  var isPaidMeta = hasFbclid ||
    (med === 'paid' || med === 'cpc' || med === 'paid_social' || med.indexOf('lead_form') !== -1) ||
    src === 'ig' || src === 'fb' || src === 'facebook' || src === 'instagram' || src === 'meta';
  if (isPaidMeta) {
    if (src === 'ig' || src === 'instagram' || content.indexOf('ig_') !== -1 || content.indexOf('instagram') !== -1) {
      return 'instagram pago';
    }
    if (src === 'fb' || src === 'facebook' || content.indexOf('fb_') !== -1 || content.indexOf('facebook') !== -1) {
      return 'facebook pago';
    }
    return 'meta pago';
  }
  if (ref.indexOf('whatsapp') !== -1 || ref.indexOf('wa.me') !== -1 || src === 'whatsapp') return 'whatsapp';
  if (ref.indexOf('instagram.com') !== -1 || src === 'instagram_org') return 'instagram organico';
  if (ref.indexOf('facebook.com') !== -1 || ref.indexOf('l.facebook') !== -1 || src === 'facebook_org') return 'facebook organico';
  if (ref.indexOf('linkedin.com') !== -1) return 'linkedin';
  if (ref.indexOf('youtube.com') !== -1 || ref.indexOf('youtu.be') !== -1) return 'youtube';
  if (ref.indexOf('tiktok.com') !== -1) return 'tiktok';
  if (med === 'social') return 'social';
  if (ref.indexOf('google.') !== -1 && !hasGclid) return 'google organico';
  if (ref.indexOf('bing.com') !== -1) return 'bing organico';
  if (!ref && !src && !hasGclid && !hasFbclid) return 'direto';
  if (ref) {
    try {
      var host = ref.replace(/^https?:\/\//, '').split('/')[0];
      return 'referral: ' + host;
    } catch (_) { return 'referral'; }
  }
  return src || 'nao identificado';
}

// ============= ENVIO PRO CRM DROS (v2 - mais dados no source_detail + tags) =============
function sendToCRM_(data, fonte) {
  if (!CRM_URL) return { status: 'sem_url', body: '' };

  var telClean = (data.telefone || '').replace(/\D/g, '');
  var cnpjClean = (data.cnpj || '').replace(/\D/g, '');

  // Monta source_detail com os campos qualificadores (aparece no card do CRM)
  var detailBits = [];
  if (data.perfil_empresa)   detailBits.push('Perfil: ' + data.perfil_empresa);
  if (data.ja_comercializa)  detailBits.push('Ja vende: ' + data.ja_comercializa);
  if (data.canal_vendas)     detailBits.push('Canal: ' + data.canal_vendas);
  if (data.volume_compra)    detailBits.push('Volume: ' + data.volume_compra);
  if (data.prazo_pedido)     detailBits.push('Prazo: ' + data.prazo_pedido);
  if (data.cargo)            detailBits.push('Cargo: ' + data.cargo);
  if (data.mensagem)         detailBits.push('Msg: ' + data.mensagem);

  // Tags automaticas pra filtragem rapida no CRM
  var tags = [LEAD_TAG];
  if (data.perfil_empresa) {
    if (data.perfil_empresa.toLowerCase().indexOf('loja') !== -1) tags.push('Perfil: Loja');
    if (data.perfil_empresa.toLowerCase().indexOf('distribuidor') !== -1) tags.push('Perfil: Distribuidora');
  }
  if (data.volume_compra) {
    // Extrai a faixa e vira tag
    var vc = data.volume_compra;
    if (vc.indexOf('50.000') !== -1) tags.push('Volume 50k+');
    else if (vc.indexOf('20.000') !== -1) tags.push('Volume 20-50k');
    else if (vc.indexOf('10.000') !== -1) tags.push('Volume 10-20k');
    else if (vc.indexOf('5.000') !== -1) tags.push('Volume 5-10k');
  }
  if (data.prazo_pedido) {
    if (data.prazo_pedido.indexOf('quanto antes') !== -1) tags.push('Prazo: Urgente');
    else if (data.prazo_pedido.indexOf('15 dias') !== -1) tags.push('Prazo: 15 dias');
    else if (data.prazo_pedido.indexOf('30 dias') !== -1) tags.push('Prazo: 30 dias');
    else if (data.prazo_pedido.indexOf('avaliando') !== -1) tags.push('Prazo: Avaliando');
  }

  var payload = {
    name: data.nome || '',
    phone: telClean,
    email: data.email || '',
    city: data.cidade || '',
    state: data.estado || '',
    empresa: data.empresa || '',
    cpf_cnpj: cnpjClean,

    source: fonte || 'landing_page_revendedores',
    source_detail: detailBits.join(' | '),

    tag: LEAD_TAG,
    tags: tags,

    utm_source:   data.utm_source || '',
    utm_medium:   data.utm_medium || '',
    utm_campaign: data.utm_campaign || '',
    utm_content:  data.utm_content || '',
    utm_term:     data.utm_term || '',
    gclid:        data.gclid || '',
    fbclid:       data.fbclid || '',
    fbp:          data.fbp || '',
    fbc:          data.fbc || '',

    page_url:   data.url || '',
    user_agent: data.user_agent || ''
  };

  var headers = { 'Content-Type': 'application/json' };
  if (CRM_TOKEN) headers['Authorization'] = 'Bearer ' + CRM_TOKEN;

  try {
    var resp = UrlFetchApp.fetch(CRM_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: true
    });
    return {
      status: resp.getResponseCode(),
      body: (resp.getContentText() || '').substring(0, 500)
    };
  } catch (err) {
    return { status: 'erro', body: String(err) };
  }
}

// ============= HELPER JSON RESPONSE =============
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============= TESTE MANUAL v2 =============
function testLead() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        nome: 'Teste v2 Manual',
        empresa: 'Loja Teste Automotivos LTDA',
        cnpj: '12.345.678/0001-90',
        email: 'teste@teste.com',
        telefone: '(11) 99999-9999',
        cidade: 'Sao Paulo',
        estado: 'SP',
        perfil_empresa: 'Loja de produtos automotivos',
        ja_comercializa: 'Sim, mas queremos ampliar nosso portfolio',
        canal_vendas: 'Loja fisica e vendas online',
        volume_compra: 'De R$ 10.000 a R$ 19.999',
        prazo_pedido: 'Nos proximos 15 dias',
        cargo: 'Proprietario ou socio',
        mensagem: '',
        url: 'https://revendedor.texasquimica.com.br/v2.html?utm_source=instagram&utm_medium=paid',
        referrer: '',
        user_agent: 'GoogleAppsScript-TestV2',
        timestamp_iso: new Date().toISOString(),
        form_version: 'v2',
        utm_source: 'instagram',
        utm_medium: 'paid',
        utm_campaign: 'teste_v2'
      })
    }
  };
  var res = doPost(fake);
  Logger.log(res.getContent());
}
