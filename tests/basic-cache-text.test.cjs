'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../gas/07_BasicSheet.gs'),'utf8');
new Function(source);
const cacheFormat="cache.getRange(2,2,required-1,1).setNumberFormat('@')";
const cacheWrite="cache.getRange(2+offset,1,Math.min(n,result.rows.length-offset),13)";
const viewFormat="basic.getRange('A9:A'+basic.getMaxRows()).setNumberFormat('@')";
const viewWrite="basic.getRange('A9').setFormula(";
for(const token of [cacheFormat,cacheWrite,viewFormat,viewWrite])
 assert.ok(source.includes(token),'missing plain-text guard: '+token);
assert.ok(source.indexOf(cacheFormat)<source.indexOf(cacheWrite),
 'set plain-text number format BEFORE cache.setValues()');
assert.ok(source.indexOf(viewFormat)<source.indexOf(viewWrite),
 'set plain-text number format BEFORE FILTER spill');
assert.ok(source.includes("prevRows,13).clearContent()"),
 'previous coerced Date values should be cleared');
console.log('Basic-cache category labels are formatted as plain text before writes and FILTER.');
