#!/bin/sh
# Print a reviewable plan ONLY. This script never calls gcloud or creates a VM.
set -eu
cat <<'PLAN'
# Verify these existing resources/rules first; no current wallet VM is changed.
gcloud compute networks subnets describe lianum-wallet-europe-west1 --project=lianum --region=europe-west1 --format='value(network,ipCidrRange)'
gcloud compute firewall-rules list --project=lianum --filter='network:lianum-wallet' --format='table(name,direction,sourceRanges,targetTags,allowed,denied)'

# Outbound only, scoped to the existing 10.71.0.0/24 primary subnet.
# Do not substitute --nat-all-subnet-ip-ranges.
gcloud compute routers create lianum-paeg-egress --project=lianum --region=europe-west1 --network=lianum-wallet
gcloud compute routers nats create lianum-paeg-egress --project=lianum --router=lianum-paeg-egress --region=europe-west1 --nat-custom-subnet-ip-ranges=lianum-wallet-europe-west1 --auto-allocate-nat-external-ips

# SSH only from IAP, targeted exclusively at the engine tag.
gcloud compute firewall-rules create lianum-paeg-iap-ssh --project=lianum --network=lianum-wallet --direction=INGRESS --priority=1000 --action=ALLOW --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=lianum-paeg-engine

# Private API-to-motor HTTPS only. This does not activate the public API route.
gcloud compute firewall-rules create lianum-paeg-api-ingress --project=lianum --network=lianum-wallet --direction=INGRESS --priority=1000 --allow=tcp:9445 --source-ranges=10.71.0.2/32 --target-tags=lianum-paeg-engine

# Candidate hardware, no external address, cloud service account or OAuth scope.
gcloud compute instances create lianum-paeg-demo --project=lianum --zone=europe-west1-b --machine-type=n2-standard-4 --network=lianum-wallet --subnet=lianum-wallet-europe-west1 --no-address --no-service-account --no-scopes --tags=lianum-paeg-engine --metadata=enable-oslogin=TRUE,block-project-ssh-keys=TRUE --image-project=ubuntu-os-cloud --image-family=ubuntu-2404-lts-amd64 --boot-disk-size=100GB --boot-disk-type=pd-balanced --no-boot-disk-auto-delete --deletion-protection

# Transfer only the public courier through IAP; no user seed/provider vault copy.
gcloud compute ssh lianum-paeg-demo --project=lianum --zone=europe-west1-b --tunnel-through-iap
PLAN
