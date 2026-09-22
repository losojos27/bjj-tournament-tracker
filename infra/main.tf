# Infrastructure for the tracker. Today: the DNS that points brackets.gracklefighter.com at GitHub Pages.
# Next: the results sync on Lambda + EventBridge (see CLAUDE.md, "Next"). One flat root; modules when
# something exists twice.
#
#   cd infra && terraform init && terraform plan
#
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    bucket       = "bjj-tournament-tracker-tfstate-6548a670" # filled in from infra/bootstrap's output
    key          = "infra/terraform.tfstate"
    region       = "us-east-1"
    profile      = "personal_terraform"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region  = var.region
  profile = var.profile
  default_tags {
    tags = { project = "bjj-tournament-tracker", managed_by = "terraform" }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}
variable "profile" {
  type    = string
  default = "personal_terraform"
}
variable "zone_name" {
  description = "The Route53 hosted zone the tracker lives under (already exists; not managed here)."
  type        = string
  default     = "gracklefighter.com"
}
variable "site_host" {
  description = "Hostname for the tracker within the zone."
  type        = string
  default     = "brackets"
}
variable "pages_target" {
  description = "The GitHub Pages hostname the CNAME points at."
  type        = string
  default     = "losojos27.github.io"
}

data "aws_route53_zone" "site" {
  name         = var.zone_name
  private_zone = false
}

# GitHub Pages on a subdomain: a single CNAME to the account's github.io host. GitHub provisions the
# certificate once the record resolves; "enforce HTTPS" is then switched on in the Pages settings.
resource "aws_route53_record" "site" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = "${var.site_host}.${var.zone_name}"
  type    = "CNAME"
  ttl     = 300
  records = [var.pages_target]
}

output "site_url" { value = "https://${aws_route53_record.site.name}/" }
