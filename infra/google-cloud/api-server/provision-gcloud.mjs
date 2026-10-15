/** Explicit creation of the reviewed, billable Lianum VM. Defaults to plan only. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const plan = {...JSON.parse(readFileSync(new URL('../network/plan.json', import.meta.url))), ...JSON.parse(readFileSync(new URL('./gcloud-plan.json', import.meta.url)))};
if (process.argv.length > 3 || ![undefined, '--plan', '--create'].includes(process.argv[2])) {
  throw Error('Use --plan or --create. Creation incurs Google Cloud charges.');
}
if (process.argv[2] !== '--create') {
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  process.exit(0);
}
if (plan.project !== 'lianum') throw Error('Unexpected deployment project');
const executable = process.env.LIANUM_GCLOUD_BIN || 'gcloud';
function gcloud(args) {
  const result = spawnSync(executable, [...args, '--project=' + plan.project, '--quiet'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw Error(result.stderr || 'gcloud failed');
  return result.stdout.trim();
}
const project = JSON.parse(gcloud(['projects', 'describe', plan.project, '--format=json']));
if (project.projectId !== 'lianum' || project.lifecycleState !== 'ACTIVE') throw Error('Project is not active');
const billing = JSON.parse(gcloud(['billing', 'projects', 'describe', plan.project, '--format=json']));
if (!billing.billingEnabled) throw Error('Billing is not enabled');
gcloud(['services', 'enable', 'compute.googleapis.com', 'iap.googleapis.com']);
// Refuse to overwrite or assume ownership of an earlier or partial deployment.
for (const [resource, name] of [
  [['networks'], plan.network], [['networks', 'subnets'], plan.subnetwork],
  [['addresses'], plan.staticAddress], [['instances'], plan.instance],
  [['firewall-rules'], 'lianum-wallet-https'], [['firewall-rules'], 'lianum-wallet-iap-ssh'],
]) {
  const matches = gcloud(['compute', ...resource, 'list', '--filter=name=' + name, '--format=value(name)']);
  if (matches) throw Error('Resource already exists; inspect before resuming: ' + name);
}
gcloud(['compute', 'networks', 'create', plan.network, '--subnet-mode=custom']);
gcloud(['compute', 'networks', 'subnets', 'create', plan.subnetwork,
  '--network=' + plan.network, '--region=' + plan.region, '--range=' + plan.subnetworkRange]);
gcloud(['compute', 'firewall-rules', 'create', 'lianum-wallet-https', '--network=' + plan.network,
  '--direction=INGRESS', '--action=ALLOW', '--rules=tcp:80,tcp:443',
  '--source-ranges=0.0.0.0/0', '--target-tags=lianum-wallet-api']);
gcloud(['compute', 'firewall-rules', 'create', 'lianum-wallet-iap-ssh', '--network=' + plan.network,
  '--direction=INGRESS', '--action=ALLOW', '--rules=tcp:22',
  '--source-ranges=' + plan.sshOnlyFromIAP, '--target-tags=lianum-wallet-api']);
gcloud(['compute', 'addresses', 'create', plan.staticAddress, '--region=' + plan.region]);
const address = gcloud(['compute', 'addresses', 'describe', plan.staticAddress,
  '--region=' + plan.region, '--format=value(address)']);
gcloud(['compute', 'instances', 'create', plan.instance, '--zone=' + plan.zone,
  '--machine-type=' + plan.machineType, '--image-family=' + plan.imageFamily,
  '--image-project=' + plan.imageProject, '--boot-disk-size=' + plan.bootDiskGB + 'GB',
  '--boot-disk-type=' + plan.bootDiskType, '--no-boot-disk-auto-delete', '--deletion-protection',
  '--network=' + plan.network, '--subnet=' + plan.subnetwork, '--address=' + address,
  '--no-service-account', '--no-scopes', '--tags=lianum-wallet-api',
  '--metadata=block-project-ssh-keys=TRUE',
  '--metadata-from-file=startup-script=' + fileURLToPath(new URL('./bootstrap.sh', import.meta.url)),
  '--labels=application=lianum,component=wallet-api']);
process.stdout.write(JSON.stringify({project: plan.project, instance: plan.instance, address,
  dnsRecord: {type: 'A', name: 'api.lianum', value: address, proxy: false},
  codeInstalled: false, httpsVerified: false}, null, 2) + '\n');
