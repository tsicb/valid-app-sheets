/**
 * Internal template helpers. Existing tabs are NEVER reformatted here.
 */
function vasInspectExistingTemplate_(ss) {
  const result = { missing: [], errors: [] };
  VAS_SHEETS.forEach(function(def) {
    const sheet = ss.getSheetByName(def.name);
    if (!sheet) { result.missing.push(def.name); return; }
    const checks = vasHeaderChecksForKind_(def.kind);
    checks.forEach(function(check) {
      const actual = sheet.getRange(check.range).getDisplayValues()[0];
      if (actual.length !== check.labels.length ||
          actual.some(function(v, i) { return v !== check.labels[i]; })) {
        result.errors.push(def.name + ' の ' + check.range + ' の見出しが設計と異なります。');
      }
    });
  });
  return result;
}

function vasHeaderChecksForKind_(kind) {
  switch (kind) {
    case 'applications':
      return [{range:'A1:W1', labels:VAS_APPLICATION_HEADERS}];
    case 'jobs':
      return [{range:'A1:T1', labels:VAS_JOB_HEADERS}];
    case 'imageMaster':
      return [{range:'A1:E1', labels:VAS_IMAGE_MASTER_HEADERS}];
    case 'basicCache':
      return [{range:'A1:M1', labels:VAS_BASIC_CACHE_HEADERS}];
    case 'basic':
      return [{range:'A8:L8', labels:VAS_BASIC_HEADERS}];
    case 'images':
      return [{range:'A8:N8', labels:VAS_IMAGE_HEADERS}];
    case 'tags':
      return [{range:'A8:N8', labels:VAS_TAG_HEADERS}];
    case 'custom':
      return [{range:'A12:D12', labels:['行軸1','行軸2','行軸3','行合計']}];
    case 'settings':
      return [{range:'G4:J4',labels:['指標ID','分析項目','表示ON','利用可否']}];
    case 'masters':
      return [
        {range:'A4:C4',labels:VAS_MASTER_HEADERS.keywords},
        {range:'E4:G4',labels:VAS_MASTER_HEADERS.enterprises},
        {range:'I4:K4',labels:VAS_MASTER_HEADERS.tags}
      ];
    case 'progress':
      return [{range:'A28:D28',labels:['応募年月','応募数','ターゲット応募数','ターゲット率']}];
    case 'progressCache':
      return [{range:'A1:D1',labels:['応募年月','月内応募日','応募数','ターゲット応募数']}];
    case 'state':
      return [{range:'A1:B1',labels:['管理キー','値']}];
    default:
      return [];
  }
}

function vasInitializeNewSheet_(sheet, kind) {
  const visible = !['basicCache','progressCache','state','jobs','imageMaster'].includes(kind);
  sheet.setTabColor(visible ? VAS_THEME.blue : VAS_THEME.muted);
  if (kind === 'applications') { vasInitializeTable_(sheet, VAS_APPLICATION_HEADERS); return; }
  if (kind === 'jobs') { vasInitializeTable_(sheet, VAS_JOB_HEADERS); return; }
  if (kind === 'imageMaster') { vasInitializeTable_(sheet, VAS_IMAGE_MASTER_HEADERS); return; }
  if (kind === 'basicCache') { vasInitializeTable_(sheet, VAS_BASIC_CACHE_HEADERS); return; }
  if (kind === 'progressCache') {
    vasInitializeTable_(sheet, ['応募年月','月内応募日','応募数','ターゲット応募数']);
    return;
  }
  if (kind === 'state') { vasInitState_(sheet); return; }
  vasSetTitle_(sheet, vasTitleForKind_(kind));
  if (kind === 'home') vasInitHome_(sheet);
  else if (kind === 'settings') vasInitSettings_(sheet);
  else if (kind === 'masters') vasInitMasters_(sheet);
  else if (kind === 'basic') vasInitBasic_(sheet);
  else if (kind === 'progress') vasInitProgress_(sheet);
  else if (kind === 'custom') vasInitCustom_(sheet);
  else if (kind === 'images') vasInitImageView_(sheet);
  else if (kind === 'tags') vasInitTagView_(sheet);
}

function vasTitleForKind_(kind) {
  return {
    home:'有効応募分析 | ホーム',
    settings:'分析設定',
    masters:'マスタ編集',
    basic:'基本分析',
    progress:'応募進捗',
    custom:'カスタム分析',
    images:'TOP画像別応募傾向',
    tags:'Indeed求人タグ別応募傾向'
  }[kind] || '有効応募分析';
}

function vasSetTitle_(sheet, title) {
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, 230);
  sheet.setColumnWidths(2, 11, 115);
  const block = sheet.getRange('A1:L2');
  block.merge();
  block.setValue(title)
    .setBackground(VAS_THEME.navy)
    .setFontColor(VAS_THEME.white)
    .setFontWeight('bold')
    .setFontSize(17)
    .setVerticalAlignment('middle');
  sheet.setRowHeights(1, 2, 26);
  sheet.getRange('A3:L3').setBackground(VAS_THEME.soft);
}

function vasSetHeader_(sheet, a1, labels) {
  const range = sheet.getRange(a1);
  range.setValues([labels]);
  range.setFontColor(VAS_THEME.white)
    .setFontWeight('bold')
    .setBackground(VAS_THEME.blue)
    .setVerticalAlignment('middle');
}

function vasInitializeTable_(sheet, headers) {
  const cols = headers.length;
  vasEnsureColumns_(sheet, cols);
  sheet.setFrozenRows(1);
  vasSetHeader_(sheet, sheet.getRange(1, 1, 1, cols).getA1Notation(), headers);
  sheet.setRowHeight(1, 34);
  sheet.setColumnWidths(1, cols, 145);
  sheet.setColumnWidth(1, 200);
  // Filter covers existing empty rows; data writer will update filter range
  // if records exceed the template's initial 1,000 rows.
  sheet.getRange(1, 1, sheet.getMaxRows(), cols).createFilter();
}

function vasEnsureColumns_(sheet, columns) {
  const current = sheet.getMaxColumns();
  if (current < columns) sheet.insertColumnsAfter(current, columns - current);
}

function vasCheckboxValidation_() {
  return SpreadsheetApp.newDataValidation().requireCheckbox().build();
}
function vasPositiveValidation_() {
  return SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0)
    .setAllowInvalid(false).build();
}
function vasWholeNonNegativeValidation_() {
  return SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, 200)
    .setAllowInvalid(false).build();
}
function vasListValidation_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true)
    .setAllowInvalid(false).build();
}
function vasRangeValidation_(source) {
  return SpreadsheetApp.newDataValidation().requireValueInRange(source, true)
    .setAllowInvalid(false).build();
}

function vasColorInput_(range) {
  range.setBackground(VAS_THEME.input).setFontColor(VAS_THEME.navy);
}

function vasRemoveDefaultBlankSheet_(ss) {
  ['Sheet1','シート1'].forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || ss.getSheets().length < 2) return;
    // Never delete a default tab with actual contents.
    if (sheet.getLastRow() > 0 || sheet.getLastColumn() > 0) return;
    ss.deleteSheet(sheet);
  });
}
