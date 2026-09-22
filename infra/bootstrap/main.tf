# One-time bootstrap: the S3 bucket that holds Terraform state for infra/. Run once with local state,
# then never touch it again. Locking uses S3's conditional writes (Terraform 1.10+), so no DynamoDB table.
#
#   cd infra/bootstrap && terraform init && terraform apply
#
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region  = "us-east-1"
  profile = "personal_terraform"
  default_tags {
    tags = { project = "bjj-tournament-tracker", managed_by = "terraform" }
  }
}

resource "random_id" "suffix" { byte_length = 4 }

resource "aws_s3_bucket" "tfstate" {
  bucket = "bjj-tournament-tracker-tfstate-${random_id.suffix.hex}"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "bucket" { value = aws_s3_bucket.tfstate.bucket }
