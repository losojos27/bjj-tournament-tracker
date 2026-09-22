# infra

Terraform for the tracker's AWS side, in account `576982585955` via the `personal_terraform` profile.
GitHub-side settings (the Pages custom domain, the repo `CNAME` file) are not managed here.

```
cd infra/bootstrap && terraform init && terraform apply   # once: creates the state bucket, prints its name
cd infra && terraform init && terraform plan && terraform apply
```

Put the bootstrap output's bucket name into `infra/main.tf`'s backend block before the first `init`.
