'use strict';
/* Run from repository root: node tests/csv-import.test.cjs */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const filename=path.join(__dirname,'../gas/CsvImportLogic.html');
const source=fs.readFileSync(filename,'utf8')
  .replace(/^<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
const VAS_IMPORT=new Function(source+'\nreturn VAS_IMPORT;')();
const LF=String.fromCharCode(10),CRLF=String.fromCharCode(13,10);
const parser=VAS_IMPORT.parseCsvText;

function expectThrow(fn,part) {
  assert.throws(fn,e=>String(e.message||e).includes(part),part);
}
const appA=parser([
  '企業コード,お仕事NO,応募日時,氏名,年齢,性別,住所,応募媒体,対応状況,求人備考',
  '00123,X_001,2026/10/12 09:55,山田太郎,34,男,東京都新宿区,Indeed,選考中,応募由来の備考',
  '00222,Y,2026/10/12 15:30,佐藤花子,29,女,千葉県市川市,自社HP,応募,応募に埋め込まれた求人備考'
].join(CRLF));
const appB=parser([
  '応募先企業ID,応募求人ID,応募日,応募者名,年齢,性別,住所,応募媒体名,仕事名,職種',
  '00123,X_001,2026/10/13 10:00,山田太郎,34,男,東京都渋谷区,Indeed,同一人,事務',
  '00222,Y,2026/10/14 11:00,渡辺新,41,男,千葉県船橋市,Indeed,求人埋込,販売'
].join(LF));
const job=parser([
  '企業ID,仕事番号,仕事名,求人管理番号,職種,雇用形態,勤務地1,求人備考,メイン画像データファイルタイトル,公開情報区分,給与区分,給与金額MIN,Indeed用求人関連タグ',
  '00123,X,営業,112233,事務,正社員,東京都千代田区,"備考1',
  '備考2",TOP.png,6,3,250000,101::202',
  '00222,X,別会社の求人,555555,技術,正社員,千葉県習志野市,,OTHER.png,6,3,280000,205'
].join(LF));
VAS_IMPORT.validateInput(appA,'app');
VAS_IMPORT.validateInput(appB,'app');
VAS_IMPORT.validateInput(job,'job');
const model=VAS_IMPORT.buildModel([{parsed:appA},{parsed:appB}],[{parsed:job}]);

assert.equal(model.summary.incomingApplications,4);
assert.equal(model.summary.duplicateCount,1);
assert.equal(model.summary.totalApplications,3);
assert.equal(model.summary.matchedApplications,1);
assert.equal(model.summary.embeddedApplications,2);
assert.equal(model.applicationData[0][1],'00123');
assert.equal(model.applicationData[0][5],'2026-10-12');
assert.equal(model.applicationData[0][9],9);
assert.equal(model.applicationData[0][13],34);
assert.equal(model.applicationData[0][15],'漢字を含む');
assert.equal(model.applicationData[0][16],'東京都');
assert.equal(model.applicationData[0][4],1);
assert.equal(model.applicationData[1][4],0);
assert.equal(model.applicationData[2][4],0);
assert.equal(model.jobAnalysisMaster[0][11],'備考1\n備考2');
assert.equal(model.jobAnalysisMaster[0][12],'3');
assert.equal(model.jobAnalysisMaster[0][13],250000);
assert.deepEqual(model.imageCandidates,[['TOP.png','112233','','未取得','']]);
for(const r of model.jobAnalysisMaster){
  assert.equal(r.length,20);
}
for(const r of model.applicationData)assert.equal(r.length,23);
const json=JSON.stringify(model);
for(const sensitive of ['山田太郎','佐藤花子','渡辺新','東京都新宿区','千葉県市川市']){
  assert.equal(json.includes(sensitive),false,sensitive+' escaped raw source');
}
const escaped=parser('A,B'+LF+'1,"引用符""テスト'+LF+'次の行"');
assert.equal(escaped.rows[0].B,'引用符"テスト\n次の行');
expectThrow(()=>parser('A,B'+LF+'1,"閉じていない'),'引用符が閉じていません');
expectThrow(()=>VAS_IMPORT.validateInput(parser('foo,bar'+LF+'a,b'),'app'),'必須列');
expectThrow(()=>parser('A,A'+LF+'a,b'),'重複');

// A/B detection is per file, and an A type does not require 応募求人ID.
assert.equal(appA.format,'A');
assert.equal(appB.format,'GENERIC'); // without 応募者ID this is not a genuine CSV_B
const trueB=parser([
  '応募先企業ID,応募求人ID,応募者ID,応募日,応募者名,年齢,性別,求人都道府県,求人市区町村,求人勤務地住所,住所,仕事名,掲載仕事備考',
  '900001,DEMO-A_123,012,2026/10/16 10:20,架空検証,30,女,北海道,千歳市,美々,北海道札幌市,架空空港求人,求人元の備考'
].join(LF));
VAS_IMPORT.validateInput(trueB,'app');
assert.equal(trueB.format,'B');
const matchedJob=parser([
  '企業ID,仕事番号,仕事名,求人管理番号,雇用形態,職種,勤務地1,求人備考,公開情報区分',
  '900001,DEMO-A,先頭求人,80001234,正社員,事務,北海道千歳市,,6',
  '900001,DEMO-A,重複求人,80001235,正社員,事務,北海道千歳市,,6'
].join(LF));
VAS_IMPORT.validateInput(matchedJob,'job');
const joined=VAS_IMPORT.buildModel([{parsed:trueB}],[{parsed:matchedJob}]);
assert.equal(joined.summary.workNumberMatches,1);
assert.equal(joined.summary.matchedApplications,1);
assert.equal(joined.applicationData[0][2],'DEMO-A_123'); // original source identifier retained
assert.equal(joined.applicationData[0][4],1);
assert.equal(joined.jobAnalysisMaster[0][5],'先頭求人'); // first matching job row wins
assert.equal(joined.jobAnalysisMaster[0][11],'求人元の備考'); // application note fallback
assert.equal(joined.applicationData[0][17],1); // application-side location matches residence
assert.equal(JSON.stringify(joined).includes('架空検証'),false);

// A numeric 応募求人ID is still a work-number, not a management ID.
// In particular, it must NOT match a job's numeric 求人管理番号.
const managementOnlyApp=parser([
  '応募先企業ID,応募求人ID,応募者ID,応募日,応募者名',
  '900001,80001234,012,2026/10/16 10:20,架空検証'
].join(LF));
VAS_IMPORT.validateInput(managementOnlyApp,'app');
const managementOnly=VAS_IMPORT.buildModel([{parsed:managementOnlyApp}],[{parsed:matchedJob}]);
assert.equal(managementOnly.summary.matchedApplications,0);
assert.equal(managementOnly.summary.workNumberMatches,0);
assert.equal(managementOnly.applicationData[0][2],'80001234');
assert.equal(managementOnly.applicationData[0][4],0);
assert.equal(managementOnly.summary.embeddedApplications,0);

// No cross-enterprise join even if the work number is identical.
const wrongCompany=parser([
  '応募先企業ID,応募求人ID,応募者ID,応募日,応募者名',
  '999999,DEMO-A_123,987,2026/10/16 10:20,別の架空検証'
].join(LF));
VAS_IMPORT.validateInput(wrongCompany,'app');
const wrong=VAS_IMPORT.buildModel([{parsed:wrongCompany}],[{parsed:matchedJob}]);
assert.equal(wrong.summary.workNumberMatches,0);
assert.equal(wrong.summary.noSameCompany,1);

// App-side workplace is authoritative for the residence matching axis;
// job CSV workplace must not silently replace it.
const mismatchApp=parser([
  '企業コード,仕事番号,応募日時,氏名,住所,勤務地1',
  '900001,DEMO-A_001,2026/10/16 12:10,別の検証,東京都豊島区,東京都港区'
].join(LF));
VAS_IMPORT.validateInput(mismatchApp,'app');
const mismatched=VAS_IMPORT.buildModel([{parsed:mismatchApp}],[{parsed:matchedJob}]);
assert.equal(mismatched.summary.matchedApplications,1);
assert.equal(mismatched.applicationData[0][17],1);
assert.equal(mismatched.jobAnalysisMaster[0][10],'北海道');

// Real exported job CSV columns are not secretly decoded into made-up labels.
const codeJob=parser([
  '企業ID,仕事番号,仕事名,求人管理番号,雇用形態区分,職種コード,勤務場所名1,勤務地住所1,県コード1',
  '900001,DEMO-A,架空求人,876543,4,432,架空空港,美々,1'
].join(LF));
const codeModel=VAS_IMPORT.buildModel([{parsed:mismatchApp}],[{parsed:codeJob}]);
assert.equal(codeModel.jobAnalysisMaster[0][6],'');
assert.equal(codeModel.jobAnalysisMaster[0][7],'');
assert.equal(codeModel.jobAnalysisMaster[0][9],''); // not mapped in Web version

// The Web key for an embedded job is allowed when enterprise ID exists
// even when work number is blank. It is not an actual CSV job match.
const numberless=parser([
  '企業コード,仕事番号,応募日時,氏名,仕事名',
  '900001,,2026/10/17 09:30,番号なし,応募CSV内の仕事'
].join(LF));
VAS_IMPORT.validateInput(numberless,'app');
const embedded=VAS_IMPORT.buildModel([{parsed:numberless}],[]);
assert.equal(embedded.summary.matchedApplications,0);
assert.equal(embedded.summary.embeddedApplications,1);
assert.equal(embedded.jobAnalysisMaster.length,1);
assert.equal(embedded.applicationData[0][3],'JOB000001');

// Web getYYYYMM uses a tolerant yyyy/mm extraction for de-duplication.
const badDate=parser([
  '企業コード,仕事番号,応募日時,氏名',
  '900001,A,2026/10/99 12:00,検証架空氏名',
  '900001,B,2026/10/98 12:00,検証架空氏名'
].join(LF));
const badDateResult=VAS_IMPORT.buildModel([{parsed:badDate}],[]);
assert.equal(badDateResult.summary.duplicateCount,1);
assert.equal(badDateResult.summary.invalidDateCount,1);

process.stdout.write('CSV parser, normalization, joins, privacy and count tests passed.\n');
