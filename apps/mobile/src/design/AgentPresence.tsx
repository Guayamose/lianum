import {useEffect,useRef,useState} from 'react';
import Svg,{Path} from 'react-native-svg';
import {View} from 'react-native';
import {useMotionAllowed} from './useMotionAllowed';
import {createParticlesRenderer,type ParticleContext} from './vendor/voiceorbs/lib/particles-renderer';
import {createStateMix,stateEnergy,type OrbState} from './vendor/voiceorbs/lib/orb-state';
import type {OrbFrame} from './vendor/voiceorbs/lib/use-orb-animator';
type Shape={d:string;fill:string;opacity:number};
/** Original 720-particle VoiceOrbs renderer, with a native SVG drawing adapter. */
export function AgentPresence({size=56,animate=false,state='idle'}:{size?:number;animate?:boolean;state?:OrbState}){
 const target=useRef(state);target.current=state;const motion=useMotionAllowed(),[shapes,setShapes]=useState<Shape[]>([]);
 useEffect(()=>{let paths:Shape[]=[],d='',last=0,raf=0;const frame:OrbFrame={dt:0,dPhase:0,phase:0,time:0,weights:createStateMix('idle').weights,level:0,live:false,reduced:!motion,state:'idle'};
  const ctx:ParticleContext={globalAlpha:1,globalCompositeOperation:'lighter',fillStyle:'#253746',setTransform(){},clearRect(){paths=[];},beginPath(){d='';},moveTo(){},arc(x,y,r){d+=`M${x-r},${y}a${r},${r} 0 1,0 ${2*r},0a${r},${r} 0 1,0 ${-2*r},0`;},fill(){paths.push({d,fill:String(ctx.fillStyle),opacity:ctx.globalAlpha});}};
  const mix=createStateMix(target.current);const draw=createParticlesRenderer(ctx,140,frame,()=>({from:target.current==='thinking'?'#9A916E':target.current==='error'?'#AF7872':'#607382',to:'#253746'}));const render=(at:number)=>{if(!last||at-last>=1000/20){const dt=last?Math.min((at-last)/1000,.1):0;last=at;frame.state=target.current;frame.weights=mix.update(target.current,motion?dt:1);frame.level=stateEnergy(target.current,frame.time);frame.live=target.current==='thinking'||target.current==='speaking';frame.dt=dt;frame.dPhase=motion&&animate?dt:0;frame.phase+=frame.dPhase;frame.time+=dt;draw(frame);setShapes(paths);}if(motion&&animate)raf=requestAnimationFrame(render);};render(performance.now());return()=>cancelAnimationFrame(raf);
 },[motion,animate]);
 return <View accessible accessibilityRole="image" accessibilityLabel={state==='thinking'?'Lianum está trabajando':state==='speaking'?'Lianum está respondiendo':'Orbe de Lianum'} style={{width:size,height:size}}><Svg width={size} height={size} viewBox="0 0 140 140">{shapes.map((shape,i)=><Path key={i} d={shape.d} fill={shape.fill} opacity={shape.opacity}/>)}</Svg></View>;
}
