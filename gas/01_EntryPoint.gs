/** Bound-sheet menu, CSV upload and basic-analysis entry points. */
function onOpen() {
  const ui=SpreadsheetApp.getUi();
  // Daily actions first; infrequent recovery and maintenance are nested.
  const images=ui.createMenu('画像関連')
    .addItem('TOP画像URLを取得', 'refreshTopImages')
    .addItem('取得失敗した画像URLを再試行', 'retryFailedTopImages');
  const individual=ui.createMenu('個別に再集計')
    .addItem('基本分析を再集計', 'applyBasicAnalysis')
    .addItem('応募進捗を再集計', 'applyProgressAnalysis')
    .addItem('TOP画像・Indeedタグを再集計', 'applyDetailAnalysis')
    .addItem('カスタム分析の候補を更新', 'refreshCustomAxes');
  const imports=ui.createMenu('CSV取込の管理')
    .addItem('取込状態を確認', 'checkVASImportStatus')
    .addItem('中断したCSV取込を破棄', 'abandonVASImport');
  const maintenance=ui.createMenu('保守・復旧')
    .addItem('テンプレート状態を点検', 'verifyTemplate')
    .addItem('初期テンプレートを作成・確認', 'setupTemplate')
    .addItem('旧データを復旧', 'recoverVASImport');
  const admin=ui.createMenu('その他・管理')
    .addSubMenu(images)
    .addSubMenu(individual)
    .addSubMenu(imports)
    .addSubMenu(maintenance)
    .addSeparator()
    .addItem('使い方・現在の実装範囲', 'showTemplateHelp');
  ui.createMenu('有効応募分析')
    .addItem('CSVを取り込む・更新', 'openCsvDialog')
    .addItem('分析結果を更新', 'updateAllAnalysis')
    .addItem('カスタム分析を実行', 'applyCustomAnalysis')
    .addSubMenu(admin)
    .addToUi();
  try { vasRefreshBasicStatus_(); } catch (_) {}
  try { vasProgressCheckStatus_(SpreadsheetApp.getActiveSpreadsheet()); } catch (_) {}
  try { vasCustomRefreshStatus_(); } catch (_) {}
  try { vasDetailRefreshStatus_(); } catch (_) {}
}
function onEdit(e) {
  // Light indicator refresh only: no automatic heavy aggregation.
  try { vasOnEditBasicStatus_(e); } catch (_) {}
  try { vasProgressOnEdit_(e); } catch (_) {}
  try { vasCustomOnEdit_(e); } catch (_) {}
  try { vasDetailOnEdit_(e); } catch (_) {}
}

/**
 * Adds missing template tabs without rewriting an existing tab.
 * On a complete template a second call is read-only.
 */
function setupTemplate() {
  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getDocumentLock();
  if (!lock || !lock.tryLock(30000)) {
    ui.alert('ほかの処理が実行中です。終了後に再実行してください。');
    return;
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('スプレッドシートを取得できません。');
    const check = vasInspectExistingTemplate_(ss);
    if (check.errors.length) {
      throw new Error('既存タブの構造が一致しません。\n' +
                      check.errors.join('\n') +
                      '\n内容を自動修復せずに処理を中止しました。');
    }

    const created = [];
    VAS_SHEETS.forEach(function(def) {
      if (ss.getSheetByName(def.name)) return;
      const sheet = ss.insertSheet(def.name);
      vasInitializeNewSheet_(sheet, def.kind);
      created.push(def.name);
    });

    // Tab order is only set for a completely fresh template. This
    // avoids moving the tabs users already organized.
    if (created.length === VAS_SHEETS.length) {
      VAS_SHEETS.forEach(function(def, index) {
        const sheet = ss.getSheetByName(def.name);
        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(index + 1);
      });
      vasRemoveDefaultBlankSheet_(ss);
    }

    // Install cross-tab dropdowns only for newly created views.
    vasFinalizeNewTemplate_(ss, created);

    // Hide only the newly-created internal tabs; do not override the
    // user's visibility decisions on subsequent runs.
    created.forEach(function(name) {
      const def = VAS_SHEETS.find(function(x) { return x.name === name; });
      if (def && !def.visible) ss.getSheetByName(name).hideSheet();
    });

    ss.setActiveSheet(ss.getSheetByName('00_ホーム'));
    const after = vasInspectExistingTemplate_(ss);
    if (after.errors.length) throw new Error(after.errors.join('\n'));
    ui.alert(
      created.length
        ? 'テンプレートの初期設定が完了しました。\n新規作成: ' +
          created.length + 'タブ\n\nレイアウトを作成しました。CSV取込・基本分析はメニューから実行できます。'
        : 'テンプレートは既に作成済みです。設定値・マスタ・書式は変更していません。'
    );
  } catch (err) {
    ui.alert('初期設定を完了できませんでした。\n' + String(err.message || err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function verifyTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = vasInspectExistingTemplate_(ss);
  const ui = SpreadsheetApp.getUi();
  if (result.errors.length) {
    ui.alert('テンプレート点検\n\n' +
             result.errors.join('\n') +
             '\n\n必要であれば設計に沿って修復してください。' +
             '自動上書きはしていません。');
    return;
  }
  if (result.missing.length) {
    ui.alert('テンプレート点検\n\n未作成タブ: ' +
             result.missing.join('、') +
             '\n「初期テンプレートを作成・確認」を実行してください。');
    return;
  }
  ui.alert('テンプレート点検\n\n全' + VAS_SHEETS.length +
           'タブの基本構造を確認しました。\n' +
           '検証はヘッダーと必須タブが対象です。分析内容の正確性検証は未実装です。');
}

function showTemplateHelp() {
  SpreadsheetApp.getUi().alert(
    '有効応募分析 スプレッドシート版 v' + VAS_TEMPLATE_VERSION + '\n\n' +
    '1. 「CSVを取り込む・更新」から応募CSVと求人CSVを読み込みます。\n' +
    '2. 「30_分析設定」「31_マスタ編集」で条件を調整します。\n' +
    '3. 「分析結果を更新」で基本分析・応募進捗・TOP画像・Indeedタグと'+
      'カスタム分析の選択候補をまとめて更新します。\n' +
    '4. カスタム分析は「42_カスタム分析」で軸を選び'+
      '「カスタム分析を実行」します。既存の選択・集計結果は一括更新では変えません。\n' +
    '5. 画像URL取得、個別再集計、取込の管理、復旧は'+
      '「その他・管理」にまとめています。\n\n' +
    'プルダウンによる基本分析の表示切替と応募進捗の日別・累積切替は'+
      '再集計せず使えます。'
  );
}
