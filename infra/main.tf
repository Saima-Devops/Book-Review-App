terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
provider "aws" {
  region = var.region
}
variable "region" {
  default = "ap-south-1"
}
variable "instance_type" {
  default = "t3.medium"
}
variable "ssh_cidr" {
  type = string
  validation {
    condition     = can(cidrhost(var.ssh_cidr, 0)) && endswith(var.ssh_cidr, "/32")
    error_message = "Use your public IPv4 address followed by /32."
  }
}
variable "public_key_path" {
  type = string
}
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
resource "aws_vpc" "app" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "reading-room" }
}
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.app.id
  cidr_block              = "10.42.1.0/24"
  map_public_ip_on_launch = true
}
resource "aws_internet_gateway" "app" {
  vpc_id = aws_vpc.app.id
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.app.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.app.id
  }
}
resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}
resource "aws_security_group" "app" {
  name_prefix = "reading-room-"
  vpc_id      = aws_vpc.app.id
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }
  dynamic "ingress" {
    for_each = [3000, 3001]
    content {
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_key_pair" "app" {
  key_name_prefix = "reading-room-"
  public_key      = file(pathexpand(var.public_key_path))
}
resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app.id]
  key_name               = aws_key_pair.app.key_name
  metadata_options {
    http_tokens = "required"
  }
  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }
  tags       = { Name = "reading-room-compose" }
  depends_on = [aws_route_table_association.public]
}
resource "aws_eip" "app" {
  domain     = "vpc"
  instance   = aws_instance.app.id
  depends_on = [aws_internet_gateway.app]
}
output "public_ip" {
  value = aws_eip.app.public_ip
}
output "frontend_url" {
  value = "http://${aws_eip.app.public_ip}:3000"
}
output "backend_url" {
  value = "http://${aws_eip.app.public_ip}:3001"
}
