#!/usr/bin/env node
// 把 tools/maps.js 產生的地圖寫回 js/campaign_fs.js 中標記為「// mapgen:<名稱>」的 map 陣列
'use strict';
const fs = require('fs'), path = require('path');
const { draw } = require('./mapgen.js'), SPECS = require('./maps.js');
const file = path.join(__dirname, '..', 'js', 'campaign_fs.js');
let src = fs.readFileSync(file, 'utf8');
src = src.replace(/( *)map: \[ \/\/ mapgen:(\w+)\n(?:\1  '.*',\n)*\1\],/g, (all, ind, name) => {
  const { rows } = draw(SPECS[name]);
  return `${ind}map: [ // mapgen:${name}\n${rows.map(r => `${ind}  '${r}',`).join('\n')}\n${ind}],`;
});
fs.writeFileSync(file, src);
console.log('地圖已同步');
