/** Finite diagnostics only: never publish exception text, RPC payloads or paths. */
export function publicErrorDataV9(error){
 if(arguments.length!==1)throw Error('PUBLIC_ERROR_DATA_ARGUMENTS');
 const visit=(value,depth)=>{
  const first=typeof value?.message==='string'?value.message.split('\n',1)[0]:'';
  const children=value instanceof AggregateError?value.errors.slice(0,4):value?.cause instanceof Error?[value.cause]:[];
  return {
   reason:/^[A-Z][A-Z0-9_]{1,120}$/.test(first)?first:'ORIGINAL_OPERATION_REJECTED',
   errorClass:['TypeError','ReferenceError','AssertionError','RangeError','SyntaxError','AggregateError','Error'].includes(value?.name)?value.name:null,
   code:typeof value?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(value.code)?value.code:null,
   httpStatus:Number.isInteger(value?.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599?value.httpStatus:null,
   rpcMethod:typeof value?.rpcMethod==='string'&&/^(?:eth_[a-zA-Z]{1,40}|get[A-Za-z]{1,40})$/.test(value.rpcMethod)?value.rpcMethod:null,
   locations:String(value?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,8).map(line=>line.match(/([a-z0-9-]+\.mjs:\d+:\d+)\)?$/i)?.[1]).filter(Boolean),
   causes:depth<3?children.map(child=>visit(child,depth+1)):[],
  };
 };
 return visit(error,0);
}
