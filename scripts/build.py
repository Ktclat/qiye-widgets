#!/usr/bin/env python3
"""Build independent, version-pinned widget pages and a source catalogue."""
from pathlib import Path
import argparse,base64,json,re,hashlib,shutil,zipfile
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=root/'dist');args=parser.parse_args();out=args.output.resolve()
if out==root or out in root.parents:raise SystemExit('Output must not overwrite the source checkout')
version=json.loads((root/'package.json').read_text())['version']
IMPORT=re.compile(r"import\s*\{([^}]+)\}\s*from\s*'\./([a-z0-9-]+)\.js';")
ordered=[];visiting=set();visited=set()
def visit(name):
 if name in visiting:raise ValueError('Circular import: '+name)
 if name in visited:return
 visiting.add(name);source=(root/'src'/f'{name}.js').read_text(encoding='utf-8')
 for match in IMPORT.finditer(source):visit(match[2])
 if re.search(r'^\s*import\b',IMPORT.sub('',source),re.M):raise ValueError('Unsupported import '+name)
 visiting.remove(name);visited.add(name);ordered.append(name)
visit('widget-app');chunks=[]
for name in ordered:
 source=(root/'src'/f'{name}.js').read_text(encoding='utf-8');exports=re.findall(r'^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)',source,re.M)
 source=re.sub(r'^export\s+','',source,flags=re.M)
 source=IMPORT.sub(lambda m:'const {'+re.sub(r'\s+as\s+',': ',m[1])+'} = __'+m[2].replace('-','_')+';',source)
 chunks.append('const __'+name.replace('-','_')+' = (()=>{\n'+source+'\nreturn {'+', '.join(exports)+'};\n})();')
bootstrap=(root/'runtime/bootstrap.js').read_text(encoding='utf-8').replace('/* QIYE_BUNDLE */','\n'.join(chunks)).replace('</script','<\\/script')
css='\n'.join((root/path).read_text(encoding='utf-8') for path in json.loads((root/'runtime/styles.json').read_text()))
css+='\n'+(root/'runtime/embed.css').read_text(encoding='utf-8')
font=base64.b64encode((root/'fonts/inter-latin-variable.woff2').read_bytes()).decode();css=css.replace("url('fonts/inter-latin-variable.woff2')","url('data:font/woff2;base64,"+font+"')")
license=(root/'fonts/OFL-Inter.txt').read_text(encoding='utf-8').replace('--','- -')
html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Qiye Widgets '+version+'</title><style>'+css+'</style><!-- Inter license\n'+license+'\n--></head><body><dialog id="dialog" open><main id="widget-root"></main></dialog><script>'+bootstrap+'</script></body></html>'
release=out/'releases'/version;release.mkdir(parents=True,exist_ok=True)
page=release/'widget.html'
if page.exists() and page.read_text(encoding='utf-8')!=html and out!=root/'dist':raise SystemExit('Refusing to overwrite a published version; bump package and manifests first')
page.write_text(html,encoding='utf-8')
manifests=[json.loads(path.read_text(encoding='utf-8')) for path in sorted((root/'manifests').glob('*.json'))]
for manifest in manifests:
 if manifest['release']!=version or '/releases/'+version+'/' not in manifest['entry']:raise ValueError('Manifest version does not match package')
catalog={'format':'qiye-widget-source','version':1,'name':'栖页官方小组件 / Qiye Widgets','widgets':manifests}
(out/'index.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(release/'index.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'.nojekyll').write_text('');shutil.copyfile(root/'LICENSE',out/'LICENSE');shutil.copyfile(root/'LICENSE-GPL-3.0',out/'LICENSE-GPL-3.0')
(out/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Qiye Widgets</title><h1>栖页小组件</h1><p>在栖页设置 → 小组件源中启用官方源。</p><p><a href="index.json">组件目录 '+version+'</a> · <a href="https://github.com/Ktclat/qiye-widgets">源码与文档</a></p>',encoding='utf-8')
shutil.copyfile(root/'README.md',out/'README.md')
shutil.copytree(root/'community',out/'community',dirs_exist_ok=True)
archive=out/f'qiye-widgets-{version}.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for path in [page,release/'index.json',out/'LICENSE',out/'LICENSE-GPL-3.0']:
  info=zipfile.ZipInfo(path.relative_to(out).as_posix(),date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,path.read_bytes())
(out/f'qiye-widgets-{version}-SHA256SUMS.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
print(f'Built {len(manifests)} widgets, {version}, {len(html.encode())} bytes: {out}')
