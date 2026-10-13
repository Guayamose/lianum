import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
 open(group:string,origin:string,certificatePEM:string,certificateSHA256:string,deadlineMs:number):Promise<string>;
 post(sessionId:string,requestId:string,path:string,body:string):Promise<{status:number;body:string;contentType:string|null;contentLength:string|null}>;
 cancel(sessionId:string,requestId:string):void;
 close(sessionId:string):Promise<void>;
 readConnectionProfile(group:string):Promise<string>;
}
export default TurboModuleRegistry.get<Spec>('LianumPagedPinnedTls');
