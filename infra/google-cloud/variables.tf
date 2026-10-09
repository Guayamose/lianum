variable "project_id" {
  description = "Existing project ID. Leave empty for local validation; this module never creates a project."
  type        = string
  default     = ""
  validation {
    condition     = var.project_id == "" || can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Use an existing Google Cloud project ID."
  }
}
variable "region" {
  type    = string
  default = "europe-west1"
}
variable "name" {
  type    = string
  default = "lianum"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,19}$", var.name))
    error_message = "Name must have 2–20 lowercase letters, digits or hyphens."
  }
}
variable "enable_foundation" {
  description = "Creates identities, APIs, image repository, PostgreSQL and empty secret metadata. These resources incur costs when applied."
  type        = bool
  default     = false
}
variable "enable_api" {
  description = "Requires foundation, a reviewed image and a completed economic adapter. The current bootstrap deliberately remains unready."
  type        = bool
  default     = false
}
variable "api_image" {
  description = "Verified Artifact Registry image pinned by sha256 digest; no mutable tags."
  type        = string
  default     = ""
}
variable "api_image_verified" {
  type    = bool
  default = false
}
variable "economic_adapter_verified" {
  description = "Enable only after real mobile owner/account authorization, worker and keeper integration tests. Current run.mjs has no adapter."
  type        = bool
  default     = false
}
variable "public_origin" {
  description = "Exact canonical HTTPS origin signed by mobile; configure routing/certificate separately before exposing the API."
  type        = string
  default     = ""
}
variable "database_secret_version" {
  description = "Existing numbered version of the DATABASE_URL secret. Provision database user/password and secret contents outside Terraform/state."
  type        = string
  default     = ""
}
variable "privacy_secret_version" {
  description = "Existing numbered version of the separate platform privacy HMAC key. Preserve the same key with SQL backups; do not regenerate it on UNKNOWN or put its contents in Terraform/state."
  type        = string
  default     = ""
}
variable "allow_public_api" {
  description = "Explicitly grant allUsers invocation only after mobile signature boundary, admission limits and abuse controls are reviewed."
  type        = bool
  default     = false
}
variable "sql_tier" {
  type    = string
  default = "db-custom-1-3840"
}
variable "enable_proof_jobs" {
  description = "Creates separate jobs only for real verified proof-worker images. No scheduler or job execution is configured."
  type        = bool
  default     = false
}
variable "proof_jobs" {
  type = map(object({
    image           = string
    image_verified  = bool
    command         = list(string)
    args            = list(string)
    cpu             = string
    memory          = string
    timeout_seconds = number
  }))
  default = {}
  validation {
    condition = alltrue([for key, job in var.proof_jobs :
      can(regex("^[a-z][a-z0-9-]{1,20}$", key)) && job.image_verified &&
      can(regex("^[a-z0-9-]+-docker[.]pkg[.]dev/[^ ]+@sha256:[0-9a-f]{64}$", job.image)) &&
      length(job.command) > 0 && length(job.args) > 0 &&
      contains(["1", "2", "4", "8"], job.cpu) &&
      can(regex("^[1-9][0-9]*(Mi|Gi)$", job.memory)) &&
      job.timeout_seconds >= 60 && job.timeout_seconds <= 3600
    ])
    error_message = "Each job requires a verified immutable Artifact Registry image, explicit worker command/args, valid CPU/memory and 60–3600s timeout."
  }
}
