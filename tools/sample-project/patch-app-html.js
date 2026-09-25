#!/usr/bin/env node
// Re-applies the "?sample=1 opens the sample project directly" feature to
// app.html.
//
// Why this exists: app.html is a minified single-file build that gets
// replaced wholesale on every direct upload (its own build process, not
// this repo's). Each replacement uses fresh minified identifiers, so a
// hand-written patch (or a plain git diff/cherry-pick) from a previous
// version won't apply. This script re-locates the same two spots by their
// STABLE surroundings (literal UI strings and the shape of the code, not
// variable names) and reinserts the same two effects.
//
// Run this after every app.html update. It refuses to touch a file that
// already has the patch, so it's safe to run unconditionally.
//
// Usage: node tools/sample-project/patch-app-html.js [path-to-app.html]

const fs = require('fs');
const path = require('path');

const appPath = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'app.html'));
let src = fs.readFileSync(appPath, 'utf8');

if (src.includes('qualiapp_sample_project_id')) {
  console.log('app.html already has the sample-loading patch. Nothing to do.');
  process.exit(0);
}

// --- Step 1: find the "new backup format" import handler function name. ---
// Anchored on the standalone Import-backup screen's stable UI copy, then the
// shape `(headerCheck(bytes) ? newFormatHandler : oldFormatHandler)({file:`.
const importScreenAnchor = 'This creates a new project — it never overwrites an existing one.';
const importScreenIdx = src.indexOf(importScreenAnchor);
if (importScreenIdx === -1) {
  throw new Error('Could not find the Import-backup screen anchor text — app.html copy may have changed.');
}
const componentDeclRe = /function\s+([$A-Za-z_][$\w]*)\(\{onImported:[$A-Za-z_][$\w]*,onCancel:[$A-Za-z_][$\w]*\}\)\{/g;
let m;
let lastDecl = null;
while ((m = componentDeclRe.exec(src))) {
  if (m.index > importScreenIdx) break;
  lastDecl = m;
}
if (!lastDecl) {
  throw new Error('Could not find the Import-backup component function declaration.');
}
const componentSlice = src.slice(lastDecl.index, importScreenIdx + 2000);
const handlerRe = /\([$A-Za-z_][$\w]*\([$A-Za-z_][$\w]*\)\?([$A-Za-z_][$\w]*):[$A-Za-z_][$\w]*\)\(\{file:/;
const handlerMatch = componentSlice.match(handlerRe);
if (!handlerMatch) {
  throw new Error('Could not find the import-handler dispatch inside the Import-backup component.');
}
const importFnName = handlerMatch[1];

// --- Step 2: find the router's mount effect and the refresh/open fn names. ---
// Anchored on the router's initial view state, `{kind:"switcher"}`.
const switcherAnchor = '{kind:"switcher"}';
const switcherIdx = src.indexOf(switcherAnchor);
if (switcherIdx === -1) {
  throw new Error('Could not find the router\'s switcher state anchor — app.html structure may have changed.');
}
const effectRe = /([$A-Za-z_][$\w]*)\.useEffect\(\(\)=>\{var ([$A-Za-z_][$\w]*);\(async\(\)=>\{const ([$A-Za-z_][$\w]*)=await ([$A-Za-z_][$\w]*)\(\);\3\.length>0&&await ([$A-Za-z_][$\w]*)\(\3\[0\]\)\}\)\(\),\(\2=navigator\.storage\)!=null&&\2\.persist&&navigator\.storage\.persist\(\)\.catch\(\(\)=>\{\}\)\},\[\]\);/;
const afterSwitcher = src.slice(switcherIdx);
const effectMatch = afterSwitcher.match(effectRe);
if (!effectMatch) {
  throw new Error('Could not find the router\'s mount effect — app.html structure may have changed.');
}
const [fullEffectText, hooksAlias, , , refreshFnName, openFnName] = effectMatch;

// --- Step 3: build the replacement (guard + new effect) and splice it in. ---
const guarded = fullEffectText.replace(
  `.length>0&&await ${openFnName}(`,
  `.length>0&&new URLSearchParams(window.location.search).get("sample")!=="1"&&await ${openFnName}(`
);

const newEffect =
  `${hooksAlias}.useEffect(()=>{(async()=>{try{` +
  `const sp=new URLSearchParams(window.location.search);` +
  `if(sp.get("sample")!=="1")return;` +
  `const markerId=window.localStorage.getItem("qualiapp_sample_project_id");` +
  `const list=await ${refreshFnName}();` +
  `let target=markerId?list.find(pr=>pr.id===markerId):null;` +
  `if(!target){` +
  `const res=await fetch("sample-project.qbk2");` +
  `if(!res.ok)throw new Error("sample project fetch failed: "+res.status);` +
  `const blob=await res.blob();` +
  `target=await ${importFnName}({file:blob,password:"sample123",projectTitle:"Sample Project"});` +
  `window.localStorage.setItem("qualiapp_sample_project_id",target.id)` +
  `}` +
  `const cleanUrl=new URL(window.location.href);` +
  `cleanUrl.searchParams.delete("sample");` +
  `window.history.replaceState(null,"",cleanUrl.toString());` +
  `await ${openFnName}(target)` +
  `}catch(err){console.error("QualiApp: failed to auto-load sample project",err)}})()},[]);`;

const patchedAfterSwitcher = afterSwitcher.replace(fullEffectText, guarded + newEffect);
src = src.slice(0, switcherIdx) + patchedAfterSwitcher;

fs.writeFileSync(appPath, src);
console.log(
  `Patched ${path.relative(process.cwd(), appPath)}: refresh fn = ${refreshFnName}, open fn = ${openFnName}, import fn = ${importFnName}`
);
