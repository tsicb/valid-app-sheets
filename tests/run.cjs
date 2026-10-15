'use strict';
// Run from the repository root: node tests/run.cjs
const fs = require('node:fs');
const path = require('node:path');
const { runTemplateSmokeTests } = require('./template-smoke.js');

const root = path.resolve(__dirname, '..');
const scripts = ['00_Config.gs','01_EntryPoint.gs','02_TemplateBase.gs','03_TemplateViews.gs'];
const source = scripts.map(name => fs.readFileSync(path.join(root, 'gas', name), 'utf8')).join('\n\n');
try {
  const report = runTemplateSmokeTests(source);
  process.stdout.write('Template smoke tests passed.\n'+JSON.stringify(report,null,2)+'\n');
} catch (error) {
  process.stderr.write(String(error.stack || error)+'\n');
  process.exitCode = 1;
}
