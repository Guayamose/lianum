/** Full active-source import audit. Reads AST/package DATA; never imports product code. */
import {readFileSync,existsSync,statSync,realpathSync} from 'node:fs';
import {dirname,resolve,relative,extname,join} from 'node:path';
import {builtinModules} from 'node:module';
import ts from 'typescript';

const extensions=['.mjs','.js','.cjs','.ts','.tsx','.mts','.cts'];
const declarations=/\.d\.(?:ts|mts|cts)$/;
const builtins=new Set(builtinModules.flatMap(name=>[name,name.startsWith('node:')?name:'node:'+name]));
const file=path=>existsSync(path)&&statSync(path).isFile();
const plainSource=path=>extensions.includes(extname(path))&&!declarations.test(path);
const literal=node=>ts.isStringLiteralLike(node)?node.text:null;

export function auditBlockImports({root,files,exceptions=[]}){
 root=resolve(root);const selected=new Set(files.map(path=>resolve(root,path))),index=new Map(),issues=[],computed=[],opaque=[],exceptionHits=[];
 const allowed=new Map(exceptions.map(row=>[row.source+'\0'+row.specifier,row]));
 if(allowed.size!==exceptions.length||exceptions.some(row=>!row.reason))throw Error('Invalid exact import exceptions');
 let importsChecked=0,namesChecked=0,typeOnlyImports=0;const label=path=>relative(root,path);
 const issue=(path,line,kind,specifier,name)=>issues.push({file:label(path),line,kind,specifier,...(name?{name}:{})});
 function packageFile(source,name){for(let at=dirname(source);;at=dirname(at)){const p=join(at,'node_modules',name,'package.json');if(file(p))return p;if(dirname(at)===at)break;}if(name.startsWith('@lianum/')){const p=join(root,'packages',name.slice(8),'package.json');if(file(p))return p;}return null;}
 function exportTarget(value,conditions,star){if(typeof value==='string')return star===null?value:value.replaceAll('*',star);if(value===null)return null;if(Array.isArray(value)){for(const next of value){const found=exportTarget(next,conditions,star);if(found!==undefined)return found;}return undefined;}if(value&&typeof value==='object'){for(const [condition,next]of Object.entries(value))if(conditions.has(condition)){const found=exportTarget(next,conditions,star);if(found!==undefined)return found;}}return undefined;}
 function candidate(path,allowExtensions){if(file(path)&&!declarations.test(path))return path;if(!allowExtensions)return null;for(const ext of extensions)if(file(path+ext))return path+ext;for(const ext of extensions)if(file(join(path,'index'+ext)))return join(path,'index'+ext);return null;}
 function resolveImport(source,specifier,kind){
  if(builtins.has(specifier))return{builtin:specifier};
  if(specifier.startsWith('.')||specifier.startsWith('/')){
   const allow=kind==='require'||/\.(?:tsx?|mts|cts)$/.test(source),direct=resolve(dirname(source),specifier);if(!direct.startsWith(root+'/'))return null;const found=candidate(direct,allow);
   if(found)return{path:found};
   // TypeScript permits .js spellings for authored .ts files. Resolve this
   // only for TS consumers; runtime JS may not substitute a declaration.
   if(allow&&/\.jsx?$/.test(direct)){const stem=direct.replace(/\.jsx?$/,'');for(const ext of ['.ts','.tsx'])if(file(stem+ext))return{path:stem+ext};}
   return null;
  }
  if(specifier.startsWith('#')){const resolved=ts.resolveModuleName(specifier,source,{moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext,allowJs:true},ts.sys).resolvedModule?.resolvedFileName;return resolved&&file(resolved)&&!declarations.test(resolved)?{path:resolved}:null;}
  const pieces=specifier.split('/'),name=specifier.startsWith('@')?pieces.slice(0,2).join('/'):pieces[0],subpath='.'+(pieces.slice(specifier.startsWith('@')?2:1).length?'/'+pieces.slice(specifier.startsWith('@')?2:1).join('/'):'');
  const manifestPath=packageFile(source,name);if(!manifestPath)return null;let manifest;try{manifest=JSON.parse(readFileSync(manifestPath,'utf8'));}catch{return null;}
  const base=dirname(manifestPath),mobile=label(source).startsWith('apps/mobile/'),conditions=new Set(['default',kind==='require'?'require':'import',mobile?'react-native':'node']);let target;
  if(manifest.exports!==undefined){let value=manifest.exports,star=null;if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).some(key=>key.startsWith('.'))){if(Object.hasOwn(value,subpath))value=value[subpath];else{const keys=Object.keys(value).filter(key=>key.includes('*')&&subpath.startsWith(key.split('*')[0])&&subpath.endsWith(key.split('*')[1])).sort((a,b)=>b.split('*')[0].length-a.split('*')[0].length||b.length-a.length);if(!keys.length)return null;const key=keys[0],[before,after]=key.split('*');star=subpath.slice(before.length,after.length?subpath.length-after.length:undefined);value=value[key];}}else if(subpath!=='.')return null;
   target=exportTarget(value,conditions,star);if(!target||!target.startsWith('./'))return null;const path=resolve(base,target);if(!path.startsWith(resolve(base)+'/')||!file(path)||declarations.test(path))return null;return{path,external:!name.startsWith('@lianum/')};
  }
  if(subpath!=='.')target=subpath.slice(2);else target=mobile&&typeof manifest['react-native']==='string'?manifest['react-native']:kind!=='require'&&typeof manifest.module==='string'?manifest.module:manifest.main??'index.js';
  const found=candidate(resolve(base,target),true);return found?{path:found,external:!name.startsWith('@lianum/')}:null;
 }
 function metadata(path){
  if(index.has(path))return index.get(path);const entry={names:new Set(),imports:[],stars:[],aliases:[],cjs:false,cjsOpaque:false};index.set(path,entry);
  if(!file(path)){issue(path,1,'SOURCE_MISSING','');return entry;}
  if(!plainSource(path)){entry.names.add('default');if(extname(path)==='.json'){try{Object.keys(JSON.parse(readFileSync(path,'utf8'))).forEach(name=>entry.names.add(name));}catch{issue(path,1,'JSON_INVALID','');}}return entry;}
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
  if(selected.has(path))for(const diagnostic of source.parseDiagnostics)issue(path,source.getLineAndCharacterOfPosition(diagnostic.start??0).line+1,'SYNTAX',ts.flattenDiagnosticMessageText(diagnostic.messageText,' '));
  const line=node=>source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
  function binding(node){if(ts.isIdentifier(node))entry.names.add(node.text);else for(const element of node.elements)if(!ts.isOmittedExpression(element))binding(element.name);}
  function add(node,specifier,names=[],kind='import',typeOnly=false){if(typeOnly){if(selected.has(path))typeOnlyImports++;return;}const target=resolveImport(path,specifier,kind),edge={specifier,names,target,line:line(node)};entry.imports.push(edge);if(selected.has(path))importsChecked++;if(!target){if(selected.has(path)){const key=label(path)+'\0'+specifier,row=allowed.get(key);if(row){exceptionHits.push({source:row.source,specifier:row.specifier,reason:row.reason});}else issue(path,line(node),'MODULE_NOT_FOUND',specifier);}return;}if(target.builtin)return;if(!target.external)metadata(target.path);}
  function visit(node){
   if(ts.isImportDeclaration(node)&&node.moduleSpecifier){const spec=literal(node.moduleSpecifier);if(spec!==null){const clause=node.importClause,names=[];if(clause?.name)names.push('default');if(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings))for(const element of clause.namedBindings.elements)if(!element.isTypeOnly)names.push((element.propertyName??element.name).text);const onlyNamedTypes=clause&&!clause.name&&clause.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.length>0&&clause.namedBindings.elements.every(e=>e.isTypeOnly);add(node,spec,names,'import',clause?.isTypeOnly===true||onlyNamedTypes);}}
   else if(ts.isExportDeclaration(node)&&node.moduleSpecifier){const spec=literal(node.moduleSpecifier);if(spec!==null){const names=node.exportClause&&ts.isNamedExports(node.exportClause)?node.exportClause.elements.filter(e=>!e.isTypeOnly).map(e=>(e.propertyName??e.name).text):[],onlyTypes=node.isTypeOnly||node.exportClause&&ts.isNamedExports(node.exportClause)&&node.exportClause.elements.length>0&&node.exportClause.elements.every(e=>e.isTypeOnly);add(node,spec,names,'import',onlyTypes);const edge=entry.imports.at(-1);if(!onlyTypes&&edge?.target?.path){if(!node.exportClause)entry.stars.push(edge.target);else if(ts.isNamedExports(node.exportClause)){for(const element of node.exportClause.elements)if(!element.isTypeOnly)entry.aliases.push({name:element.name.text,original:(element.propertyName??element.name).text,target:edge.target});}else if(ts.isNamespaceExport(node.exportClause))entry.names.add(node.exportClause.name.text);}}}
   else if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){const spec=node.arguments.length===1?literal(node.arguments[0]):null;if(spec!==null){const names=[];if(ts.isVariableDeclaration(node.parent)&&ts.isObjectBindingPattern(node.parent.name))for(const element of node.parent.name.elements)if(!element.dotDotDotToken)names.push((element.propertyName??element.name).getText(source));add(node,spec,names,node.expression.kind===ts.SyntaxKind.ImportKeyword?'import':'require');}else if(selected.has(path))computed.push({file:label(path),line:line(node),kind:node.expression.kind===ts.SyntaxKind.ImportKeyword?'import':'require'});}
   if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&!node.modifiers.some(m=>m.kind===ts.SyntaxKind.DeclareKeyword)){if(node.modifiers.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword))entry.names.add('default');else if(ts.isVariableStatement(node))node.declarationList.declarations.forEach(d=>binding(d.name));else if(node.name&&ts.isIdentifier(node.name)&&!ts.isInterfaceDeclaration(node)&&!ts.isTypeAliasDeclaration(node))entry.names.add(node.name.text);}
   if(ts.isExportAssignment(node))entry.names.add('default');
   if(ts.isExportDeclaration(node)&&!node.moduleSpecifier&&node.exportClause&&ts.isNamedExports(node.exportClause)&&!node.isTypeOnly)for(const element of node.exportClause.elements)if(!element.isTypeOnly)entry.names.add(element.name.text);
   if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken){const left=node.left.getText(source);if(left==='module.exports'){entry.cjs=true;entry.names.add('default');if(ts.isObjectLiteralExpression(node.right)){for(const property of node.right.properties){if(property.name&&(ts.isIdentifier(property.name)||ts.isStringLiteral(property.name)))entry.names.add(property.name.text);else entry.cjsOpaque=true;}}else entry.cjsOpaque=true;}else if(/^exports\.[\w$]+$/.test(left)||/^module\.exports\.[\w$]+$/.test(left)){entry.cjs=true;entry.names.add('default');entry.names.add(left.split('.').at(-1));}}
   ts.forEachChild(node,visit);
  }
  visit(source);return entry;
 }
 selected.forEach(metadata);let changed=true;while(changed){changed=false;for(const entry of index.values()){for(const target of entry.stars)for(const name of index.get(target.path)?.names??[])if(name!=='default'&&!entry.names.has(name)){entry.names.add(name);changed=true;}for(const alias of entry.aliases)if(index.get(alias.target.path)?.names.has(alias.original)&&!entry.names.has(alias.name)){entry.names.add(alias.name);changed=true;}}}
 for(const path of selected)for(const edge of index.get(path)?.imports??[]){if(!edge.target)continue;for(const name of edge.names){namesChecked++;if(edge.target.builtin){const builtin=process.getBuiltinModule(edge.target.builtin);if(name!=='default'&&!Object.hasOwn(builtin,name))issue(path,edge.line,'EXPORT_NOT_FOUND',edge.specifier,name);continue;}if(edge.target.external){opaque.push({file:label(path),line:edge.line,specifier:edge.specifier,name,reason:'External runtime entry resolves; third-party export interop is left to its installed declarations and component checks.'});continue;}const target=index.get(edge.target.path);if(!target?.names.has(name)){if(target?.cjsOpaque)opaque.push({file:label(path),line:edge.line,specifier:edge.specifier,name,reason:'Computed CommonJS export cannot be statically proven.'});else issue(path,edge.line,'EXPORT_NOT_FOUND',edge.specifier,name);}}
 }
 for(const row of exceptions)if(selected.has(resolve(root,row.source))&&!exceptionHits.some(hit=>hit.source===row.source&&hit.specifier===row.specifier))issue(resolve(root,row.source),1,'OBSOLETE_EXCEPTION',row.specifier);
 return{profile:'LIANUM_BLOCK_IMPORT_AUDIT_V1',filesChecked:selected.size,importsChecked,namesChecked,typeOnlyImports,issues,computedImports:computed,unverifiedBindings:opaque,exactHistoricalExceptions:exceptionHits,scope:'Runtime literal resolution and authored export names. No product module evaluated. Computed imports and external/CommonJS interop are explicitly unverified.'};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){const packet=JSON.parse(readFileSync(process.argv[2]??0,'utf8'));const result=auditBlockImports(packet);process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.issues.length?1:0;}
