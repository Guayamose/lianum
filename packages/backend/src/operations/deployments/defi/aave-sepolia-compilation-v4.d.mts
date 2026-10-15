export interface NewAaveSepoliaAdapterCompilationV4 {
 profile:'NEW_AAVE_SEPOLIA_ADAPTER_COMPILATION_V4';compiler:string;compilerPin:Readonly<Record<string,unknown>>;
 settings:Readonly<Record<string,unknown>>;names:Record<'delivery'|'exit',readonly [string,string]>;
 artifacts:Record<'delivery'|'exit',{abi:unknown[];evm:{bytecode:{object:string};deployedBytecode:{object:string};methodIdentifiers:Record<string,string>}}>;sourceRecords:Array<{path:string;bytes:number;sha256:string}>;
 sourceASTs:Record<string,unknown>;inputSHA256:string;outputSHA256:string;financialAuthority:false;publicDeployment:false;privateProofAcceptance:false;
}
export function compileFixedAaveSepoliaAdaptersV4():NewAaveSepoliaAdapterCompilationV4;
