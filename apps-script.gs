/**
 * Google Apps Script – Sync bidirecional com o Organizador IR
 *
 * Instruções:
 * 1. Abra a planilha → Extensões → Apps Script
 * 2. Cole todo este código substituindo o conteúdo
 * 3. Clique em Implantar → Nova implantação
 *    - Tipo: App da Web
 *    - Executar como: Eu
 *    - Quem tem acesso: Qualquer pessoa
 * 4. Copie a URL gerada e cole em Configurações → URL do Apps Script no app
 */

const STATUS_MAP = {
  solicitar:  'SOLICITAR',
  solicitado: 'Aguardando',
  concluido:  'Concluído',
  na:         'NA',
};

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = updateRow(data);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Suporte a GET para contornar CORS em alguns cenários
function doGet(e) {
  try {
    const data = JSON.parse(decodeURIComponent(e.parameter.d || '{}'));
    const result = updateRow(data);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateRow(data) {
  const sheet    = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const allVals  = sheet.getDataRange().getValues();

  // Localiza linha de cabeçalho
  let headerIdx = -1;
  let hdrs      = [];
  for (let i = 0; i < Math.min(10, allVals.length); i++) {
    const r = allVals[i].map(v => String(v).toUpperCase().trim().replace(/^﻿/, ''));
    if (r.some(h => h === 'DATA') && r.some(h => h.includes('VALOR'))) {
      headerIdx = i; hdrs = r; break;
    }
  }
  if (headerIdx < 0) return { ok: false, error: 'Cabeçalho não encontrado' };

  const fc = (...terms) => hdrs.findIndex(h => terms.some(t => h.includes(t)));

  // Prefere coluna DATA MM/DD se existir
  const dataMmDdCol = hdrs.findIndex(h => h.includes('DATA MM/DD'));
  const dateCol     = dataMmDdCol >= 0 ? dataMmDdCol : fc('DATA');
  const medicoCol   = fc('MÉDICO', 'MEDICO');
  const especCol    = fc('ESPECIALIDADE');
  const valorCol    = fc('VALOR TOT', 'VALOR TOTAL');
  const bradStCol   = fc('BRADESCO', 'BRADESC');
  const saPartStCol = fc('SULAMERICA PA', 'SUL AMERICA PA');
  const saKcStCol   = fc('SULAMERICA KC', 'SUL AMERICA KC');
  const comprovCol  = fc('COMPROVANTE', 'COMPROVA');
  const nfiscalCol  = fc('NOTA FISCAL');
  const pedidoCol   = fc('PEDIDO MED', 'PEDIDO MÉD');

  const nextVal = idx => (idx >= 0 && hdrs[idx + 1]?.includes('VALOR')) ? idx + 1 : -1;
  const bradVlCol   = nextVal(bradStCol);
  const saPartVlCol = nextVal(saPartStCol);
  const saKcVlCol   = nextVal(saKcStCol);

  // Converte data do app (YYYY-MM-DD) para comparação
  const [year, month, day] = data.date.split('-').map(Number);

  function dateMatches(cellVal) {
    if (cellVal instanceof Date) {
      return cellVal.getFullYear() === year &&
             cellVal.getMonth() + 1 === month &&
             cellVal.getDate() === day;
    }
    if (cellVal) {
      const parts = String(cellVal).split('/');
      if (parts.length === 3) {
        const a = Number(parts[0]), b = Number(parts[1]), c = Number(parts[2]);
        // Tenta MM/DD/YYYY e DD/MM/YYYY
        return (a === month && b === day   && c === year) ||
               (a === day   && b === month && c === year);
      }
    }
    return false;
  }

  // Procura linha correspondente por data + valor + descrição
  for (let i = headerIdx + 1; i < allVals.length; i++) {
    const row = allVals[i];

    if (!dateMatches(row[dateCol])) continue;

    const rowValor = parseBRL(String(row[valorCol] || ''));
    if (Math.abs(rowValor - data.valor) > 0.01) continue;

    const medico  = String(row[medicoCol] || '').trim();
    const espec   = String(row[especCol]  || '').trim();
    const rowDesc = medico + (espec ? ' – ' + espec : '');
    if (rowDesc !== data.desc) continue;

    // Linha encontrada — atualiza células
    const rn = i + 1; // 1-based
    const u  = data.updates || {};

    if (bradStCol   >= 0 && u.bradesco)  sheet.getRange(rn, bradStCol + 1).setValue(STATUS_MAP[u.bradesco.status]  || 'NA');
    if (bradVlCol   >= 0 && u.bradesco)  sheet.getRange(rn, bradVlCol + 1).setValue(u.bradesco.valor  || 0);
    if (saPartStCol >= 0 && u.sa_part)   sheet.getRange(rn, saPartStCol + 1).setValue(STATUS_MAP[u.sa_part.status]  || 'NA');
    if (saPartVlCol >= 0 && u.sa_part)   sheet.getRange(rn, saPartVlCol + 1).setValue(u.sa_part.valor  || 0);
    if (saKcStCol   >= 0 && u.sa_kc)     sheet.getRange(rn, saKcStCol + 1).setValue(STATUS_MAP[u.sa_kc.status]    || 'NA');
    if (saKcVlCol   >= 0 && u.sa_kc)     sheet.getRange(rn, saKcVlCol + 1).setValue(u.sa_kc.valor    || 0);
    if (comprovCol  >= 0 && u.comprovante  !== undefined) sheet.getRange(rn, comprovCol + 1).setValue(u.comprovante  ? 'Sim' : 'Não');
    if (nfiscalCol  >= 0 && u.notaFiscal   !== undefined) sheet.getRange(rn, nfiscalCol + 1).setValue(u.notaFiscal   ? 'Sim' : 'Não');
    if (pedidoCol   >= 0 && u.pedidoMedico !== undefined) sheet.getRange(rn, pedidoCol + 1).setValue(u.pedidoMedico ? 'Sim' : 'Não');

    return { ok: true, row: rn };
  }

  return { ok: false, error: `Linha não encontrada para: ${data.date} / ${data.desc} / ${data.valor}` };
}

function parseBRL(v) {
  if (typeof v === 'number') return v;
  const s = v.replace(/R\$\s*/g, '').replace(/\s/g, '').trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0;
  return parseFloat(s) || 0;
}
