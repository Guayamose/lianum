output "api_uri" {
  value = try(google_cloud_run_v2_service.api[0].uri, null)
}
output "database_connection_name" {
  value = try(google_sql_database_instance.intake[0].connection_name, null)
}
output "database_secret_name" {
  value = try(google_secret_manager_secret.database_url[0].secret_id, null)
}
output "proof_job_names" {
  value = { for key, job in google_cloud_run_v2_job.proof : key => job.name }
}
output "deployment_enabled" {
  value = { foundation = var.enable_foundation, api = var.enable_api, proof_jobs = var.enable_proof_jobs }
}
output "privacy_secret_name" {
  value = try(google_secret_manager_secret.privacy_key[0].secret_id, null)
}
