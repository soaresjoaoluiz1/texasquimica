/**
 * ENTRADA DE LEADS - TEXAS QUIMICA | DROS AGENCIA
 * Fluxo: Site (revendedor.texasquimica.com.br) -> Apps Script -> Planilha + CRM Dros
 *
 * DEPLOY:
 *  1. Abre a planilha "ENTRADA DE LEADS - TEXAS QUIMICA | DROS AGENCIA"
 *  2. Extensoes -> Apps Script
 *  3. Cola este codigo em Code.gs (substitui tudo)
 *  4. Deploy -> Novo deploy -> Tipo: Aplicativo Web
 *       - Executar como: Eu (agenciadouc@gmail.com)
 *       - Quem tem acesso: Qualquer pessoa
 *  5. Copia a URL do Web App
 *  6. Manda pro dev colar em APPS_SCRIPT_URL no index.html
 */

// ============= CONFIG =============
var SHEET_NAME = 'REVENDEDORES LP';
var CRM_URL    = 'https://drosagencia.com.br/crm/api/webhooks/lead/texas-quimica-industria-e-comercio-de-produtos-quimicos-ltda';
var CRM_TOKEN  = ''; // se o CRM exigir Bearer token, cole aqui
var LEAD_TAG   = 'Landing Page Revendedores';
var LEAD_ORIGIN = 'Landing Page Revendedores'; // origem/campanha visivel no CRM

var HEADERS = [
  'Timestamp',
  'Data/Hora BR',
  'Nome',
  'Empresa',
  'E-mail',
  'Telefone',
  'Cidade',
  'Estado',
  'Mensagem',
  'Fonte (normalizada)',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
  'URL',
  'Referrer',
  'User Agent',
  'IP',
  'CRM status',
  'CRM resposta'
];

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

    // Grava linha na planilha
    var row = [
      data.timestamp_iso || nowIso,
      nowBr,
      data.nome || '',
      data.empresa || '',
      data.email || '',
      data.telefone || '',
      data.cidade || '',
      data.estado || '',
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
      'pendente',
      ''
    ];
    var newRow = sheet.appendRow(row);
    var lastRow = sheet.getLastRow();

    // Envia pro CRM Dros
    var crmResult = sendToCRM_(data, fonte);
    sheet.getRange(lastRow, 22).setValue(crmResult.status);
    sheet.getRange(lastRow, 23).setValue(crmResult.body);

    return jsonOut_({ ok: true, lead_id: lastRow, fonte: fonte, crm: crmResult });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err), stack: err.stack });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return jsonOut_({ ok: true, msg: 'Texas Quimica LP webhook rodando' });
}

// ============= GARANTE ABA + CABECALHO =============
function ensureSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return sheet;
}

// ============= NORMALIZACAO DA FONTE =============
// Regras: retorna string amigavel pro CRM: "instagram pago", "facebook pago",
// "google pago", "instagram organico", "facebook organico", "link bio",
// "whatsapp", "direto", "referral"
function normalizeFonte_(d) {
  var src = (d.utm_source || '').toLowerCase();
  var med = (d.utm_medium || '').toLowerCase();
  var camp = (d.utm_campaign || '').toLowerCase();
  var content = (d.utm_content || '').toLowerCase();
  var ref = (d.referrer || '').toLowerCase();
  var hasFbclid = !!d.fbclid;
  var hasGclid = !!d.gclid;

  // link na bio (Instagram/linktree/beacons/etc)
  if (src.indexOf('bio') !== -1 || src === 'linktree' || src === 'beacons' ||
      med === 'bio' || camp.indexOf('bio') !== -1 ||
      ref.indexOf('linktr.ee') !== -1 || ref.indexOf('beacons.') !== -1) {
    return 'link bio';
  }

  // Google Ads
  if (hasGclid || (src.indexOf('google') !== -1 && (med === 'cpc' || med === 'paid' || med === 'ads'))) {
    return 'google pago';
  }

  // Meta Ads (identifica IG x FB pelo utm_source, se nao rota "meta pago")
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

  // WhatsApp
  if (ref.indexOf('whatsapp') !== -1 || ref.indexOf('wa.me') !== -1 || src === 'whatsapp') {
    return 'whatsapp';
  }

  // Social organico
  if (ref.indexOf('instagram.com') !== -1 || src === 'instagram_org') return 'instagram organico';
  if (ref.indexOf('facebook.com') !== -1 || ref.indexOf('l.facebook') !== -1 || src === 'facebook_org') return 'facebook organico';
  if (ref.indexOf('linkedin.com') !== -1) return 'linkedin';
  if (ref.indexOf('youtube.com') !== -1 || ref.indexOf('youtu.be') !== -1) return 'youtube';
  if (ref.indexOf('tiktok.com') !== -1) return 'tiktok';
  if (med === 'social') return 'social';

  // Busca organica
  if (ref.indexOf('google.') !== -1 && !hasGclid) return 'google organico';
  if (ref.indexOf('bing.com') !== -1) return 'bing organico';

  // Direto: sem referrer e sem utms
  if (!ref && !src && !hasGclid && !hasFbclid) return 'direto';

  // Referral desconhecido
  if (ref) {
    try {
      var host = ref.replace(/^https?:\/\//, '').split('/')[0];
      return 'referral: ' + host;
    } catch (_) { return 'referral'; }
  }
  return src || 'nao identificado';
}

// ============= ENVIO PRO CRM DROS =============
function sendToCRM_(data, fonte) {
  if (!CRM_URL) return { status: 'sem_url', body: '' };

  // Extrai DDD + telefone limpo
  var telClean = (data.telefone || '').replace(/\D/g, '');

  var payload = {
    // Identificacao do lead
    nome: data.nome || '',
    email: data.email || '',
    telefone: telClean,
    telefone_formatado: data.telefone || '',
    empresa: data.empresa || '',
    cidade: data.cidade || '',
    estado: data.estado || '',
    mensagem: data.mensagem || '',

    // Marcadores solicitados
    anuncio: 'sim',
    fonte: fonte,
    origem: LEAD_ORIGIN,
    tag: LEAD_TAG,
    tags: [LEAD_TAG],

    // Rastreamento completo
    url: data.url || '',
    referrer: data.referrer || '',
    utm_source: data.utm_source || '',
    utm_medium: data.utm_medium || '',
    utm_campaign: data.utm_campaign || '',
    utm_content: data.utm_content || '',
    utm_term: data.utm_term || '',
    gclid: data.gclid || '',
    fbclid: data.fbclid || '',
    user_agent: data.user_agent || '',
    timestamp: data.timestamp_iso || new Date().toISOString()
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

// ============= TESTE MANUAL =============
// Rode manualmente via Executar > testLead pra validar sem depender do site
function testLead() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        nome: 'Teste Manual',
        empresa: 'Teste Ltda',
        email: 'teste@teste.com',
        telefone: '(11) 99999-9999',
        cidade: 'Sao Paulo',
        estado: 'SP',
        mensagem: 'Teste do fluxo',
        url: 'https://revendedor.texasquimica.com.br/?utm_source=instagram&utm_medium=paid&utm_campaign=teste',
        referrer: '',
        user_agent: 'GoogleAppsScript',
        timestamp_iso: new Date().toISOString(),
        utm_source: 'instagram',
        utm_medium: 'paid',
        utm_campaign: 'teste',
        utm_content: '',
        utm_term: '',
        gclid: '',
        fbclid: ''
      })
    }
  };
  var res = doPost(fake);
  Logger.log(res.getContent());
}
