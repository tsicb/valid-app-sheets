/**
 * Each initializer runs ONCE, immediately after creating a missing tab.
 * Normal updates must not call these functions on existing tabs.
 */
function vasInitHome_(sheet) {
  sheet.getRange('A3:K3').setValues([[
    '項目','総応募数','項目','ターゲット応募数','項目','ターゲット率',
    '項目','求人CSV突合率','項目','埋込求人利用件数',''
  ]]);
  sheet.getRange('B4').setValue('未取込');
  sheet.getRange('D4').setValue('未取込');
  sheet.getRange('F4').setValue('未取込');
  sheet.getRange('H4').setValue('未取込');
  sheet.getRange('J4').setValue('未取込');
  ['B4','D4','F4','H4','J4'].forEach(function(a1) {
    sheet.getRange(a1).setBackground(VAS_THEME.pale)
      .setFontWeight('bold').setFontSize(13);
  });
  sheet.getRange('A3').setValue('総応募');
  sheet.getRange('C3').setValue('ターゲット');
  sheet.getRange('E3').setValue('ターゲット率');
  sheet.getRange('G3').setValue('求人CSV突合率');
  sheet.getRange('I3').setValue('埋込求人利用');
  [
    [8,'分析対象期間'],[9,'対象年齢とターゲット年齢'],
    [12,'CSV取込成功日時'],[13,'最終再集計日時'],
    [14,'データ世代'],[15,'更新状態']
  ].forEach(function(x) { sheet.getRange(x[0],1).setValue(x[1]); });
  sheet.getRange('B8:B15').setBackground(VAS_THEME.pale);
  sheet.getRange('B15').setValue('未取込');
  sheet.getRange('A18').setValue('操作案内');
  sheet.getRange('A18:L18').setBackground(VAS_THEME.blue)
    .setFontColor(VAS_THEME.white).setFontWeight('bold');
  const lines = [
    '1. 上部メニュー「有効応募分析」から初期テンプレートを作成します。',
    '2. 「30_分析設定」「31_マスタ編集」は自由に編集できます。',
    '3. 今回の初版はテンプレート生成までです。CSV取込・集計は次段階で追加します。',
    '4. 応募者の氏名・メール・電話・詳細住所などは保存しない設計です。',
    '5. 求人備考は全文保存するため、共有先にはご注意ください。',
    '6. コピー配布するときはデータの入っていない空テンプレートを利用してください。'
  ];
  sheet.getRange(19,1,lines.length,1).setValues(lines.map(function(v) { return [v]; }));
  sheet.setColumnWidth(1, 320);
}

function vasInitSettings_(sheet) {
  sheet.setColumnWidth(1, 245);
  sheet.setColumnWidth(2, 165);
  sheet.setColumnWidth(3, 275);
  sheet.setColumnWidth(7, 195);
  sheet.setColumnWidth(8, 260);
  sheet.setColumnWidth(9, 95);
  sheet.setColumnWidth(10, 120);
  sheet.getRange('A3').setValue('設定項目');
  sheet.getRange('B3').setValue('設定値');
  sheet.getRange('C3').setValue('変更後は「分析設定を反映」を実行（今後実装）');
  VAS_SETTING_SPECS.forEach(function(spec) {
    const a1 = spec[0], label = spec[1], type = spec[2], value = spec[3];
    const cell = sheet.getRange(a1);
    sheet.getRange(cell.getRow(),1).setValue(label);
    if (value !== null && value !== undefined) cell.setValue(value);
    vasColorInput_(cell);
    if (type === 'date') {
      cell.setNumberFormat('yyyy-mm-dd');
      cell.setDataValidation(SpreadsheetApp.newDataValidation().requireDate()
        .setAllowInvalid(false).build());
    } else if (type === 'int') {
      cell.setDataValidation(vasWholeNonNegativeValidation_());
    } else if (type === 'positive') {
      cell.setDataValidation(vasPositiveValidation_());
    } else if (type === 'bool') {
      cell.insertCheckboxes();
      cell.setValue(Boolean(value));
    } else if (type === 'progress-mode') {
      cell.setDataValidation(vasListValidation_(['日別','累積']));
    }
  });
  sheet.getRange('A38').setValue('集計反映状態');
  sheet.getRange('B38').setValue('未実行').setBackground(VAS_THEME.pale);

  vasSetHeader_(sheet,'G4:J4',['指標ID','分析項目','表示ON','利用可否']);
  sheet.getRange(5,7,VAS_DISPLAY_ITEMS.length,2)
    .setValues(VAS_DISPLAY_ITEMS.map(function(r) { return [r[0],r[1]]; }));
  const toggles = sheet.getRange(5,9,VAS_DISPLAY_ITEMS.length,1);
  toggles.insertCheckboxes();
  toggles.setValues(VAS_DISPLAY_ITEMS.map(function(r) { return [r[2]]; }));
  sheet.getRange(5,10,VAS_DISPLAY_ITEMS.length,1)
    .setValues(VAS_DISPLAY_ITEMS.map(function() { return ['未取込']; }));
  vasColorInput_(toggles);
  sheet.getRange('G40').setValue('指標IDと分析項目名はシステム用です。I列のチェックボックスだけ変更してください。');
}

function vasInitMasters_(sheet) {
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(3, 285);
  sheet.setColumnWidth(5, 155);
  sheet.setColumnWidth(6, 240);
  sheet.setColumnWidth(9, 180);
  sheet.setColumnWidth(10, 260);
  sheet.getRange('A3').setValue('KWは上にあるものを優先します。変更後は分析設定の再集計が必要です。');
  vasSetHeader_(sheet, 'A4:C4', VAS_MASTER_HEADERS.keywords);
  vasSetHeader_(sheet, 'E4:G4', VAS_MASTER_HEADERS.enterprises);
  vasSetHeader_(sheet, 'I4:K4', VAS_MASTER_HEADERS.tags);
  const end = sheet.getMaxRows();
  // Validation, not a setValues operation: unused master rows stay blank.
  [2,7,11].forEach(function(column) {
    sheet.getRange(5,column,end-4,1).setDataValidation(vasCheckboxValidation_());
  });
  sheet.getRange(5,1,end-4,1).setNumberFormat('@');
  sheet.getRange(5,5,end-4,1).setNumberFormat('@');
  sheet.getRange(5,9,end-4,1).setNumberFormat('@');
  sheet.getRange('A4:C4').setNote('KWは上から優先。編集内容は後続の再集計機能で適用します。');
}

function vasInitBasic_(sheet) {
  sheet.getRange('A3').setValue('分析項目');
  // Hidden tab may be created later; the data validation is installed
  // once all sheets exist by vasFinalizeNewTemplate_.
  sheet.getRange('B3').setBackground(VAS_THEME.input);
  sheet.getRange('D3').setValue('取込待ち');
  sheet.getRange('H3').setValue('固定列：年代10代～70代＋その他');
  sheet.getRange('A5').setValue('総応募');
  sheet.getRange('C5').setValue('ターゲット応募');
  sheet.getRange('E5').setValue('ターゲット率');
  sheet.getRange('G5').setValue('最終集計');
  vasSetHeader_(sheet,'A8:L8',VAS_BASIC_HEADERS);
  sheet.getRange('A9').setValue('CSV取込後に分析項目を選ぶと結果が表示されます。');
  sheet.setFrozenRows(8);
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidths(2,11,115);
  sheet.getRange('D9:D500').setNumberFormat('0.0%');
}

function vasInitProgress_(sheet) {
  sheet.getRange('A3').setValue('表示モード');
  sheet.getRange('B3').setValue('日別');
  sheet.getRange('B3').setBackground(VAS_THEME.pale);
  // Single source for progress mode is 30_分析設定!B28.
  sheet.getRange('D3').setValue('最新月応募数：未取込');
  sheet.getRange('F3').setValue('着地予測：未取込');
  sheet.getRange('H3').setValue('比較月：未取込');
  sheet.getRange('A6').setValue('CSV取込後、この領域に応募進捗グラフを表示します。');
  vasSetHeader_(sheet,'A28:D28',
    ['応募年月','応募数','ターゲット応募数','ターゲット率']);
  sheet.getRange('D29:D500').setNumberFormat('0.0%');
}

function vasInitCustom_(sheet) {
  sheet.getRange('A3:A5').setValues([['行軸1'],['行軸2'],['行軸3']]);
  sheet.getRange('D3').setValue('列軸');
  sheet.getRange('D4').setValue('表示指標');
  sheet.getRange('E4').setValue('応募数')
    .setDataValidation(vasListValidation_([
      '応募数','ターゲット応募数','ターゲット率'
    ]));
  vasColorInput_(sheet.getRange('B3:B5'));
  vasColorInput_(sheet.getRange('E3:E4'));
  sheet.getRange('A8').setValue('集計未実行：CSV取込と分析軸の設定後に実行します。')
    .setBackground(VAS_THEME.pale);
  vasSetHeader_(sheet,'A12:D12',['行軸1','行軸2','行軸3','行合計']);
  sheet.getRange('E12').setValue('列軸（未選択）')
    .setFontWeight('bold').setBackground(VAS_THEME.blue)
    .setFontColor(VAS_THEME.white);
  sheet.setFrozenRows(12);
  sheet.setColumnWidths(1,3,165);
  sheet.setColumnWidth(4,135);
}

function vasInitImageView_(sheet) {
  sheet.getRange('B3').setValue('分析データ未取込');
  sheet.getRange('H3').setValue('画像URL未取得');
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 250);
  vasSetHeader_(sheet,'A8:N8',VAS_IMAGE_HEADERS);
  sheet.getRange('A9').setValue('CSV取込後に画像別の応募データを表示します。');
  sheet.setFrozenRows(8);
  sheet.getRange('F9:F500').setNumberFormat('0.0%');
}

function vasInitTagView_(sheet) {
  sheet.getRange('B3').setValue('分析データ未取込');
  sheet.getRange('A5').setValue('1求人に複数タグがある場合、タグ別応募数の合計は全応募数と一致しません。');
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 235);
  vasSetHeader_(sheet,'A8:N8',VAS_TAG_HEADERS);
  sheet.getRange('A9').setValue('CSV取込後にタグ別の応募データを表示します。');
  sheet.setFrozenRows(8);
  sheet.getRange('F9:F500').setNumberFormat('0.0%');
}

function vasInitState_(sheet) {
  vasSetHeader_(sheet,'A1:B1',['管理キー','値']);
  vasSetHeader_(sheet,'G1:H1',['指標ID','表示名']);
  vasSetHeader_(sheet,'J1:K1',['分析軸ID','表示名']);
  sheet.getRange('A2:B6').setValues([
    ['template_version',VAS_TEMPLATE_VERSION],
    ['import_status','UNIMPORTED'],
    ['active_generation',''],
    ['last_import_at',''],
    ['last_analysis_at','']
  ]);
  sheet.setColumnWidth(1,190);
  sheet.setColumnWidth(2,170);
  sheet.setColumnWidths(7,5,185);
}

/**
 * Runs only on first-time creation of BOTH a view and its source state tab.
 * Each validation points at a persisted label list updated later by GAS.
 */
function vasFinalizeNewTemplate_(ss, created) {
  const known = {};
  created.forEach(function(x) { known[x] = true; });
  const state = ss.getSheetByName('92_運用管理');
  if (!state) return;
  if (known['40_基本分析']) {
    ss.getSheetByName('40_基本分析').getRange('B3')
      .setDataValidation(vasRangeValidation_(state.getRange('H2:H1000')));
  }
  if (known['41_応募進捗']) {
    ss.getSheetByName('41_応募進捗').getRange('B3')
      .setFormula("='30_分析設定'!B28");
  }
  if (known['42_カスタム分析']) {
    const custom = ss.getSheetByName('42_カスタム分析');
    const validation = vasRangeValidation_(state.getRange('K2:K1000'));
    custom.getRange('B3:B5').setDataValidation(validation);
    custom.getRange('E3').setDataValidation(validation);
  }
}
