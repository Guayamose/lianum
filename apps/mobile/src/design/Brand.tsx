import {SvgXml} from 'react-native-svg';
import {brandSvg} from './identity.generated';

/** Original supplied vector outlines, including the Lianum wordmark. */
export function LianumBrand({height=32,variant='imagotipo'}:{height?:number;variant?:'imagotipo'|'isotipo'|'isologo'}){
 const ratio=variant==='imagotipo'?773.7487/256:variant==='isologo'?600/570:1;
 return <SvgXml xml={brandSvg[variant].light} width={height*ratio} height={height} accessible accessibilityRole="image" accessibilityLabel="Lianum"/>;
}
