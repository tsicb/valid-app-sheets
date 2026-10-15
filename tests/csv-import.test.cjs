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

process.stdout.write('CSV parser, normalization, joins, privacy and count tests passed.\n');
