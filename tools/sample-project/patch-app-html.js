#!/usr/bin/env node
// Re-applies two features that live entirely inside app.html's own minified
// source, and so get silently wiped every time app.html is replaced
// wholesale by a direct upload:
//
//   1. "?sample=1 opens the sample project directly" (see README).
//   2. An update-check banner: on load, if online, fetches version.json
//      from GitHub and shows a small dismissible bar if a newer build is
//      published than the one currently running.
//
// Why this exists: each app.html replacement uses fresh minified
// identifiers, so a hand-written patch (or a plain git diff/cherry-pick)
// from a previous version won't apply. This script re-locates the same
// splice points by their STABLE surroundings (literal UI strings and the
// shape of the code, not variable names) and reinserts the same code.
//
// Run this after every app.html update. Each feature is patched
// independently and idempotently (skipped if already present), so it's
// safe to run unconditionally.
//
// Usage: node tools/sample-project/patch-app-html.js [path-to-app.html]

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const appPath = path.resolve(process.argv[2] || path.join(REPO_ROOT, 'app.html'));
const versionPath = path.join(REPO_ROOT, 'version.json');

let src = fs.readFileSync(appPath, 'utf8');

function applySampleLoaderPatch(src) {
  if (src.includes('qualiapp_sample_project_id')) {
    console.log('  sample-loading patch: already present, skipping.');
    return src;
  }
  // --- find the "new backup format" import handler function name. ---
  // Anchored on the standalone Import-backup screen's stable UI copy, then
  // the shape `(headerCheck(bytes) ? newFormatHandler : oldFormatHandler)({file:`.
  const importScreenAnchor = 'this creates a new project and never overwrites an existing one.';
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

  // --- find the router's mount effect and the refresh/open fn names. ---
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
  const patched = src.slice(0, switcherIdx) + patchedAfterSwitcher;
  console.log(`  sample-loading patch: refresh fn = ${refreshFnName}, open fn = ${openFnName}, import fn = ${importFnName}`);
  return patched;
}

function applyUpdateCheckerPatch(src, version) {
  const existing = src.match(/QUALIAPP_BUILD_VERSION=("(?:[^"\\]|\\.)*")/);
  if (existing) {
    const existingVersion = JSON.parse(existing[1]);
    console.log(`  update-checker patch: already present (embedded version ${existingVersion}), skipping.`);
    return { src, version: existingVersion };
  }
  // Anchored on the sole real `</script>` closing tag: app.html's whole
  // bundle is one <script type="module">...</script> element (a literal
  // "</script>" string does appear elsewhere in the bundle as an escaped
  // JS string, e.g. "<\/script>", which does not match this exact anchor).
  const closeCount = src.split('</script>').length - 1;
  if (closeCount !== 1) {
    throw new Error(`Expected exactly one literal "</script>" in app.html, found ${closeCount} — app.html structure may have changed.`);
  }
  // The banner's "Update Now" button downloads the latest app.html and, on
  // Chrome/Edge (File System Access API), offers to save it directly over
  // the file the user currently has open — using that file's own name and,
  // when it's a well-known folder, opening the save dialog right there.
  // Firefox/Safari (no File System Access API) and any other failure fall
  // back to a plain browser download the user finishes by hand.
  const banner = `
window.QUALIAPP_BUILD_VERSION=${JSON.stringify(version)};
(function(){
try{
var dismissedKey="qualiapp_update_dismissed_version";
var isFileProto=window.location.protocol==="file:";
var curPath=isFileProto?decodeURIComponent(window.location.pathname):"";
var curName=curPath?curPath.split("/").pop():"app.html";
var curDir=curPath?curPath.slice(0,curPath.length-curName.length):"";
var displayPath=curPath;
if(displayPath.length>2&&displayPath.charAt(0)==="/"&&displayPath.charAt(2)===":"){displayPath=displayPath.slice(1);}
function detectStartIn(dir){
var d=dir.toLowerCase();
if(d.indexOf("desktop")!==-1)return "desktop";
if(d.indexOf("download")!==-1)return "downloads";
if(d.indexOf("document")!==-1)return "documents";
if(d.indexOf("picture")!==-1)return "pictures";
if(d.indexOf("music")!==-1)return "music";
if(d.indexOf("video")!==-1)return "videos";
return undefined;
}
var startInHint=curDir?detectStartIn(curDir):undefined;
fetch("https://raw.githubusercontent.com/galvinradleyngo/qualiapp/main/version.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(data){
if(!data||!data.version)return;
if(data.version<=window.QUALIAPP_BUILD_VERSION)return;
if(window.localStorage.getItem(dismissedKey)===data.version)return;
var bar=document.createElement("div");
bar.style.cssText="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#134f63;color:#fff;padding:10px 16px;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;box-shadow:0 -2px 12px rgba(0,0,0,.2)";
var msg=document.createElement("span");
msg.textContent="A newer version of QualiApp is available.";
var updateBtnDefaultText="Update Now";
var updateBtn=document.createElement("button");
updateBtn.type="button";
updateBtn.textContent=updateBtnDefaultText;
updateBtn.style.cssText="background:#fff;color:#134f63;font-weight:700;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:13px";
var dismiss=document.createElement("button");
dismiss.type="button";
dismiss.textContent="Dismiss";
dismiss.style.cssText="background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:13px";
dismiss.onclick=function(){window.localStorage.setItem(dismissedKey,data.version);bar.remove()};
var hint=null;
if(curPath){
hint=document.createElement("span");
hint.textContent="Update Now will ask you to save over: "+displayPath;
hint.style.cssText="font-size:12px;opacity:.85;flex-basis:100%;text-align:center";
}
updateBtn.onclick=async function(){
updateBtn.disabled=true;
updateBtn.textContent="Downloading...";
try{
var res=await fetch("https://raw.githubusercontent.com/galvinradleyngo/qualiapp/main/app.html",{cache:"no-store"});
if(!res.ok)throw new Error("fetch failed: "+res.status);
var blob=await res.blob();
var saved=false;
if(window.showSaveFilePicker){
try{
var opts={suggestedName:curName,types:[{description:"HTML file",accept:{"text/html":[".html"]}}]};
if(startInHint)opts.startIn=startInHint;
var handle=await window.showSaveFilePicker(opts);
var writable=await handle.createWritable();
await writable.write(blob);
await writable.close();
saved=true;
}catch(pickerErr){
if(pickerErr&&pickerErr.name==="AbortError"){
updateBtn.disabled=false;
updateBtn.textContent=updateBtnDefaultText;
return;
}
}
}
if(!saved){
var blobUrl=URL.createObjectURL(blob);
var a=document.createElement("a");
a.href=blobUrl;
a.download=curName;
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(function(){URL.revokeObjectURL(blobUrl)},60000);
}
window.localStorage.setItem(dismissedKey,data.version);
msg.textContent=saved?"Updated! Close this tab, then reopen the file you just saved.":"Update downloaded - replace "+(curPath||curName)+" with the downloaded file to finish.";
updateBtn.remove();
dismiss.remove();
if(hint)hint.remove();
}catch(err){
updateBtn.disabled=false;
updateBtn.textContent=updateBtnDefaultText;
msg.textContent="Could not reach GitHub to download the update. Check your connection and try again.";
}
};
bar.appendChild(msg);
bar.appendChild(updateBtn);
bar.appendChild(dismiss);
if(hint)bar.appendChild(hint);
document.body.appendChild(bar);
}).catch(function(){});
}catch(e){}
})();`;

  const patched = src.replace('</script>', banner + '</script>');
  console.log(`  update-checker patch: embedded build version = ${version}`);
  return { src: patched, version };
}

function applyWrongPasswordPatch(src) {
  // A wrong password makes WebCrypto throw an OperationError whose message is
  // an empty string, so the import screen (which shows `error.message`) shows
  // nothing and sits on "Decrypting…" forever. Re-throw with a real message.
  const marker = 'Incorrect password, or the file is corrupted.';
  const re = /const ([$A-Za-z_][$\w]*)=await ([$A-Za-z_][$\w]*)\(([$A-Za-z_][$\w]*),([$A-Za-z_][$\w]*),([$A-Za-z_][$\w]*),\(([$A-Za-z_][$\w]*),([$A-Za-z_][$\w]*)\)=>([$A-Za-z_][$\w]*)\(`Decrypting… \(\$\{\6\}\/\$\{\7\}\)`,20\+Math\.round\(\6\/\7\*30\)\)\);/;
  const m = src.match(re);
  if (!m) {
    if (src.includes('wrongpw-patched')) {
      console.log('  wrong-password patch: already present, skipping.');
      return src;
    }
    throw new Error('Could not find the backup decrypt call — app.html structure may have changed.');
  }
  const [full, out, fnName, a1, a2, a3, p1, p2, progress] = m;
  const replacement =
    `let ${out};try{${out}=await ${fnName}(${a1},${a2},${a3},(${p1},${p2})=>${progress}(\`Decrypting… (\${${p1}}/\${${p2}})\`,20+Math.round(${p1}/${p2}*30)))}catch(e){throw new Error("${marker}")}/*wrongpw-patched*/`;
  console.log('  wrong-password patch: applied.');
  return src.replace(full, replacement);
}

const candidateVersion = new Date().toISOString().slice(0, 10);

src = applySampleLoaderPatch(src);
src = applyWrongPasswordPatch(src);
const updateCheckerResult = applyUpdateCheckerPatch(src, candidateVersion);
src = updateCheckerResult.src;
const version = updateCheckerResult.version;

fs.writeFileSync(appPath, src);
fs.writeFileSync(versionPath, JSON.stringify({ version }, null, 2) + '\n');

console.log(`Patched ${path.relative(process.cwd(), appPath)} and wrote ${path.relative(process.cwd(), versionPath)} (version ${version}).`);
