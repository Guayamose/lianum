import {readFile} from 'node:fs/promises';
import {createPublicWalletHttpServiceV1} from '@lianum/backend/public-wallet/http-service';
const file=process.env.LIANUM_PUBLIC_WALLET_CONFIG;if(!file)throw Error('Set LIANUM_PUBLIC_WALLET_CONFIG to the server configuration file.');
const config=JSON.parse(await readFile(file,'utf8'));const service=await createPublicWalletHttpServiceV1(config);
await service.listen({host:'127.0.0.1',port:Number(process.env.PORT??8788)});
process.stdout.write('Lianum public-wallet service is listening behind the configured HTTPS ingress.\n');
let stopping=false;const close=async()=>{if(stopping)return;stopping=true;await service.close();};process.once('SIGTERM',close);process.once('SIGINT',close);
