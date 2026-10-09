# Mocked provider: checks configuration and policy gates only. No Google API,
# project, credentials, database, secret version or billable resource is used.
mock_provider "google" {}

run "default_is_disabled" {
  command = plan
  assert {
    condition     = length(google_project_service.required) == 0 && length(google_sql_database_instance.intake) == 0 && length(google_cloud_run_v2_service.api) == 0 && length(google_cloud_run_v2_job.proof) == 0
    error_message = "Default configuration must create no cloud service/database/job."
  }
}
run "foundation_requires_existing_project" {
  command = plan
  variables { enable_foundation = true }
  expect_failures = [terraform_data.deployment_gates]
}
run "api_requires_reviewed_image_and_economic_adapter" {
  command = plan
  variables {
    project_id        = "lianum-test-project"
    enable_foundation = true
    enable_api        = true
  }
  expect_failures = [terraform_data.deployment_gates]
}
run "proof_jobs_require_actual_workers" {
  command = plan
  variables {
    project_id        = "lianum-test-project"
    enable_foundation = true
    enable_proof_jobs = true
  }
  expect_failures = [terraform_data.deployment_gates]
}
run "reviewed_api_uses_readiness_and_isolated_credentials" {
  command = plan
  # IAM uses the generated email; make that one computed provider output known
  # during the mocked plan without applying resources or replacing policy.
  override_resource {
    target          = google_service_account.api[0]
    override_during = plan
    values = {
      email = "lianum-api@lianum-test-project.iam.gserviceaccount.com"
    }
  }
  variables {
    project_id                = "lianum-test-project"
    enable_foundation         = true
    enable_api                = true
    api_image                 = "europe-west1-docker.pkg.dev/lianum-test-project/lianum-images/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    api_image_verified        = true
    economic_adapter_verified = true
    public_origin             = "https://wallet.example.test"
    database_secret_version   = "1"
    privacy_secret_version    = "2"
  }
  assert {
    condition     = google_cloud_run_v2_service.api[0].template[0].containers[0].ports[0].container_port == 8080 && google_cloud_run_v2_service.api[0].template[0].containers[0].readiness_probe[0].http_get[0].path == "/health/ready"
    error_message = "API must use port 8080 and real economic readiness."
  }
  assert {
    condition     = google_service_account.api[0].account_id != google_service_account.proof[0].account_id && length(google_cloud_run_v2_service_iam_member.public) == 0 && length(google_cloud_run_v2_job.proof) == 0
    error_message = "API/proof identities must be separate; public access and workers need independent explicit enabling."
  }
  assert {
    condition     = one([for env in google_cloud_run_v2_service.api[0].template[0].containers[0].env : env if env.name == "DATABASE_URL"]).value_source[0].secret_key_ref[0].version == "1" && google_project_iam_member.api_sql[0].role == "roles/cloudsql.client"
    error_message = "API database credential must come from a pinned secret version with scoped SQL client IAM."
  }
  assert {
    condition     = one([for env in google_cloud_run_v2_service.api[0].template[0].containers[0].env : env if env.name == "LIANUM_PLATFORM_PRIVACY_KEY"]).value_source[0].secret_key_ref[0].version == "2" && google_secret_manager_secret_iam_member.api_privacy_key[0].member == "serviceAccount:${google_service_account.api[0].email}"
    error_message = "Platform privacy key must use its own pinned secret and API-only IAM."
  }
}
run "proof_workers_are_separate_bounded_and_do_not_auto_retry" {
  command = plan
  variables {
    project_id        = "lianum-test-project"
    enable_foundation = true
    enable_proof_jobs = true
    proof_jobs = { test = {
      image           = "europe-west1-docker.pkg.dev/lianum-test-project/lianum-images/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      image_verified  = true
      command         = ["/reviewed/test-only-worker"]
      args            = ["--test-only"]
      cpu             = "1"
      memory          = "512Mi"
      timeout_seconds = 60
    } }
  }
  assert {
    condition     = google_cloud_run_v2_job.proof["test"].template[0].task_count == 1 && google_cloud_run_v2_job.proof["test"].template[0].template[0].max_retries == 0 && google_cloud_run_v2_job.proof["test"].template[0].template[0].timeout == "60s" && length(google_cloud_run_v2_service.api) == 0
    error_message = "Proof jobs must be isolated, bounded and unable to automatically repeat an ambiguous effect."
  }
}
