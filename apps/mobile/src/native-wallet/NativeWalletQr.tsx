import {useMemo} from 'react';
import Svg,{Path,Rect} from 'react-native-svg';
type Qr={addData:(value:string)=>void;make:()=>void;getModuleCount:()=>number;isDark:(row:number,col:number)=>boolean};
const createQr=require('qrcode-generator') as (version:number,correction:'M')=>Qr;
/** Encodes only the selected public receive address, never a seed or transaction. */
export default function NativeWalletQr({address}:{address:string}){
 const value=useMemo(()=>{const qr=createQr(0,'M');qr.addData(address);qr.make();const count=qr.getModuleCount();let path='';for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))path+=`M${col+4} ${row+4}h1v1h-1z`;return {size:count+8,path};},[address]);
 return <Svg width={216} height={216} viewBox={`0 0 ${value.size} ${value.size}`} accessibilityLabel="Código QR de tu dirección de recepción"><Rect width={value.size} height={value.size} fill="white"/><Path d={value.path} fill="#142A40"/></Svg>;
}
