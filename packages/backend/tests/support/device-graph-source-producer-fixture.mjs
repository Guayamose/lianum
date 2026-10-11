import {createDeviceGraphSourceHost} from './device-graph-source-host.mjs';
const config=JSON.parse(process.argv[2]);
const host=await createDeviceGraphSourceHost(config);
try{
 await host.api.armOriginalDeviceExternalFlatGraphSourceV2(host.service);
 process.stdout.write(JSON.stringify(await host.api.readOriginalDeviceGraphSourceConfirmedCheckpointV2(host.service))+'\n');
}finally{host.restore();}
