import {Text as NativeText,TextInput as NativeTextInput,StyleSheet,type TextProps,type TextInputProps} from 'react-native';
import {isLoaded} from 'expo-font';
import {walletFonts} from './tokens';

function fontStyle(style:TextProps['style']){
 const flat=StyleSheet.flatten(style),weight=flat?.fontWeight;
 if(flat?.fontFamily)return null;
 const family=weight==='bold'||Number(weight)>=700?walletFonts.bold:Number(weight)>=600?walletFonts.semibold:Number(weight)>=500?walletFonts.medium:walletFonts.regular;
 return isLoaded(family)?{fontFamily:family,fontWeight:'normal' as const}:null;
}
/** Keep system text scaling and every existing accessibility/input property. */
export function WalletText({style,...props}:TextProps){return <NativeText {...props} style={[style,fontStyle(style)]}/>;}
export function WalletTextInput({style,...props}:TextInputProps){return <NativeTextInput {...props} style={[style,fontStyle(style)]}/>;}
