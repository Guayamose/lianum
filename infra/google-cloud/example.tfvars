# Copy to a private *.tfvars only after choosing an existing project.
# No project or paid resource exists yet. These defaults keep everything off.
project_id        = ""
region            = "europe-west1"
name              = "lianum"
enable_foundation = false
enable_api        = false
enable_proof_jobs = false
allow_public_api  = false
# API enabling also requires immutable api_image, api_image_verified,
# economic_adapter_verified, exact public_origin and numbered secret version.
# proof_jobs has no invented placeholder image or command.
