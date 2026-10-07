locals {
  enabled = var.enable_foundation
  services = toset(local.enabled ? [
    "run.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com", "iam.googleapis.com", "storage.googleapis.com"
  ] : [])
  labels = { application = "lianum", managed_by = "terraform" }
  jobs   = var.enable_proof_jobs ? var.proof_jobs : {}
}
# The gates fail a future plan before resources can be created. Local validation
# and mocked-provider tests need no project, credentials, secrets or cloud calls.
resource "terraform_data" "deployment_gates" {
  input = { foundation = var.enable_foundation, api = var.enable_api, jobs = var.enable_proof_jobs }
  lifecycle {
    precondition {
      condition     = !var.enable_foundation || var.project_id != ""
      error_message = "An existing project ID is required; creating a project is outside this module."
    }
    precondition {
      condition     = !var.enable_api || (var.enable_foundation && var.api_image_verified && var.economic_adapter_verified)
      error_message = "API requires foundation, reviewed image and completed economic adapter; the current bootstrap is unbound."
    }
    precondition {
      condition     = !var.enable_api || can(regex("^[a-z0-9-]+-docker[.]pkg[.]dev/[^ ]+@sha256:[0-9a-f]{64}$", var.api_image))
      error_message = "API image must use an immutable Artifact Registry sha256 digest."
    }
    precondition {
      condition     = !var.enable_api || can(regex("^https://[a-z0-9.-]+(:[0-9]+)?$", var.public_origin))
      error_message = "API needs an exact HTTPS origin without path/query/credentials."
    }
    precondition {
      condition     = !var.enable_api || can(regex("^[1-9][0-9]*$", var.database_secret_version))
      error_message = "Provision a numbered DATABASE_URL secret version outside Terraform before enabling API."
    }
    precondition {
      condition     = !var.enable_proof_jobs || (var.enable_foundation && length(var.proof_jobs) > 0)
      error_message = "Proof jobs need foundation and at least one real verified worker image."
    }
    precondition {
      condition     = !var.allow_public_api || var.enable_api
      error_message = "Public invocation requires an enabled, validated API."
    }
  }
}
resource "google_project_service" "required" {
  for_each           = local.services
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
  depends_on         = [terraform_data.deployment_gates]
}
resource "google_service_account" "api" {
  count        = local.enabled ? 1 : 0
  project      = var.project_id
  account_id   = "${var.name}-api"
  display_name = "Lianum API; no user custody keys"
  depends_on   = [google_project_service.required]
}
resource "google_service_account" "proof" {
  count        = local.enabled ? 1 : 0
  project      = var.project_id
  account_id   = "${var.name}-proof"
  display_name = "Lianum proof jobs; no API database credentials"
  depends_on   = [google_project_service.required]
}
resource "google_artifact_registry_repository" "images" {
  count         = local.enabled ? 1 : 0
  project       = var.project_id
  location      = var.region
  repository_id = "${var.name}-images"
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.required]
}
resource "google_sql_database_instance" "intake" {
  count               = local.enabled ? 1 : 0
  project             = var.project_id
  name                = "${var.name}-intake"
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = true
  settings {
    tier                        = var.sql_tier
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    disk_autoresize_limit       = 50
    user_labels                 = local.labels
    deletion_protection_enabled = true
    ip_configuration {
      # Cloud Run's Cloud SQL connector encrypts/authorizes transport. No public
      # CIDR is authorized; this IP is not a password-only public listener.
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings { retained_backups = 7 }
    }
    database_flags {
      name  = "max_connections"
      value = "50"
    }
  }
  depends_on = [google_project_service.required]
}
resource "google_sql_database" "intake" {
  count    = local.enabled ? 1 : 0
  project  = var.project_id
  name     = "lianum"
  instance = google_sql_database_instance.intake[0].name
}
resource "google_secret_manager_secret" "database_url" {
  count               = local.enabled ? 1 : 0
  project             = var.project_id
  secret_id           = "${var.name}-database-url"
  deletion_protection = true
  labels              = local.labels
  replication {
    auto {}
  }
  # There is intentionally no secret_version or sql_user resource: neither
  # passwords nor secret contents are placed in Terraform configuration/state.
  depends_on = [google_project_service.required]
}
resource "google_secret_manager_secret_iam_member" "api_database" {
  count     = local.enabled ? 1 : 0
  project   = var.project_id
  secret_id = google_secret_manager_secret.database_url[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api[0].email}"
}
resource "google_project_iam_member" "api_sql" {
  count   = local.enabled ? 1 : 0
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api[0].email}"
}
resource "google_cloud_run_v2_service" "api" {
  count               = var.enable_api ? 1 : 0
  project             = var.project_id
  name                = "${var.name}-api"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  labels              = local.labels
  template {
    service_account                  = google_service_account.api[0].email
    timeout                          = "15s"
    max_instance_request_concurrency = 8
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance { instances = [google_sql_database_instance.intake[0].connection_name] }
    }
    containers {
      image = var.api_image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = false
      }
      env {
        name  = "LIANUM_PUBLIC_ORIGIN"
        value = var.public_origin
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url[0].secret_id
            version = var.database_secret_version
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      startup_probe {
        period_seconds    = 3
        timeout_seconds   = 1
        failure_threshold = 10
        http_get {
          path = "/health/live"
          port = 8080
        }
      }
      liveness_probe {
        period_seconds    = 10
        timeout_seconds   = 1
        failure_threshold = 3
        http_get {
          path = "/health/live"
          port = 8080
        }
      }
      readiness_probe {
        period_seconds    = 10
        timeout_seconds   = 1
        failure_threshold = 1
        success_threshold = 1
        http_get {
          path = "/health/ready"
          port = 8080
        }
      }
    }
  }
  depends_on = [terraform_data.deployment_gates, google_secret_manager_secret_iam_member.api_database, google_project_iam_member.api_sql]
}
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.enable_api && var.allow_public_api ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
# Proof jobs remain independent from request-serving. No placeholder worker,
# schedule, start_execution_token or automatic retries exists in this module.
resource "google_cloud_run_v2_job" "proof" {
  for_each            = local.jobs
  project             = var.project_id
  name                = "${var.name}-proof-${each.key}"
  location            = var.region
  deletion_protection = true
  labels              = local.labels
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.proof[0].email
      max_retries     = 0
      timeout         = "${each.value.timeout_seconds}s"
      containers {
        image   = each.value.image
        command = each.value.command
        args    = each.value.args
        resources { limits = { cpu = each.value.cpu, memory = each.value.memory } }
      }
    }
  }
  # No access to DATABASE_URL, root keys or private witnesses is granted here.
  # Real worker input/output identities and encrypted transport need the worker
  # contract review before a caller is given jobs.run permissions.
  depends_on = [terraform_data.deployment_gates, google_project_service.required]
}
