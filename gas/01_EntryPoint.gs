/**
 * Only functional menu commands are exposed in this setup-only phase.
 * CSV upload, settings recalculation and custom analysis are added later.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('有効応募分析')
    .addItem('CSV取込・全件更新', 'openCsvDialog')
    .addItem('取込状態を確認', 'checkVASImportStatus')
    .addSeparator()
    .addItem('初期テンプレートを作成・確認', 'setupTemplate')
    .addItem('テンプレート状態を点検', 'verifyTemplate')
    .addItem('旧データを復旧', 'recoverVASImport')
    .addSeparator()
    .addItem('使い方・現在の実装範囲', 'showTemplateHelp')
    .addToUi();
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
          created.length + 'タブ\n\n現在はレイアウトのみです。CSV取込・分析処理は次段階で追加します。'
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
    '1. 最初に「初期テンプレートを作成・確認」を実行します。\n' +
    '2. 30_分析設定で設定値を、31_マスタ編集でマスタを編集できます。\n' +
    '3. 上部メニューのCSV取込から、応募CSVと任意の求人CSVを全件アップロードできます。\n' +
    '4. 基本分析・進捗グラフ・カスタム集計は今後追加します。\n\n' +
    '空のテンプレートをコピーして、マイドライブ内で利用する設計です。'
  );
}
