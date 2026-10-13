const {withMainApplication,withDangerousMod,createRunOncePlugin}=require('expo/config-plugins');
const {mkdirSync,readFileSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const marker='// LIANUM PAGED PINNED TLS';
function withPagedPinnedTls(config,options){
 if(options!==undefined||config.android?.package!=='org.lianum.wallet')throw Error('MOBILE_PAGED_TLS_FIXED_PACKAGE');
 config=withMainApplication(config,android=>{
  if(android.modResults.language!=='kt')throw Error('MOBILE_PAGED_TLS_KOTLIN_REQUIRED');
  let text=android.modResults.contents;
  if(!text.includes(marker)){
   const entry='PackageList(this).packages.apply {';
   if(text.split(entry).length!==2)throw Error('MOBILE_PAGED_TLS_PACKAGE_ENTRY');
   text=text.replace(entry,entry+'\n          '+marker+'\n          add(org.lianum.wallet.pagedtls.PagedPinnedTlsPackage())');
  }
  android.modResults.contents=text;return android;
 });
 return withDangerousMod(config,['android',async android=>{
  const directory=join(android.modRequest.platformProjectRoot,'app/src/main/java/org/lianum/wallet/pagedtls');mkdirSync(directory,{recursive:true});
  for(const name of ['PagedPinnedTlsModule.kt','PagedPinnedTlsPackage.kt'])writeFileSync(join(directory,name),readFileSync(join(__dirname,'android',name)));
  return android;
 }]);
}
module.exports=createRunOncePlugin(withPagedPinnedTls,'lianum-paged-pinned-tls','1.0.0');
