export interface NewMorphoV2SepoliaAdapterCompilationV4 {
 profile:'NEW_MORPHO_V2_SEPOLIA_ADAPTER_COMPILATION_V4';compiler:string;compilerPin:Readonly<Record<string,unknown>>;
 settings:Readonly<Record<string,unknown>>;names:Record<'delivery'|'exit',readonly [string,string]>;
 artifacts:Record<'delivery'|'exit',{abi:unknown[];evm:{bytecode:{object:string};deployedBytecode:{object:string};methodIdentifiers:Record<string,string>}}>;sourceRecords:Array<{path:string;bytes:number;sha256:string}>;
 sourceASTs:Record<string,unknown>;inputSHA256:string;outputSHA256:string;financialAuthority:false;publicDeployment:false;privateProofAcceptance:false;
}
export function compileFixedMorphoV2SepoliaAdaptersV4():NewMorphoV2SepoliaAdapterCompilationV4;
