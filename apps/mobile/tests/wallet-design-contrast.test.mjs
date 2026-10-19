import test from 'node:test';
import assert from 'node:assert/strict';
import {walletColors as colors} from '../src/design/tokens.ts';

function luminance(hex){
 const channels=[1,3,5].map(offset=>{const n=parseInt(hex.slice(offset,offset+2),16)/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;});
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
function readable(fg,bg,minimum){const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);assert.ok(ratio>=minimum,`${fg} on ${bg}: ${ratio.toFixed(2)}:1, requires ${minimum}:1`);}

test('Lianum light text, selection and semantic notices meet small-text contrast',()=>{
 for(const background of [colors.background,colors.surface,colors.primarySoft]){
  for(const foreground of [colors.text,colors.muted,colors.accentStrong])readable(foreground,background,4.5);
 }
 readable(colors.background,colors.primary,4.5);
 for(const tone of ['success','warning','danger']){readable(colors[tone],colors[tone+'Soft'],4.5);readable(colors.text,colors[tone+'Soft'],4.5);}
});
test('Lianum input boundaries and selected filters meet non-text contrast',()=>{
 for(const background of [colors.background,colors.surface])readable(colors.controlBorder,background,3);
 readable(colors.accentStrong,colors.primarySoft,3);
});
