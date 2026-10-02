#!/usr/bin/env python3
"""Create a protected Compose env file from runtime inputs or Secrets Manager."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--non-interactive', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    target = root / '.env'
    existing = {}
    if target.exists():
        for line in target.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                existing[key] = value

    def runtime(name, default='', sensitive=False):
        value = os.environ.get(name) or existing.get(name)
        if not value:
            if args.non_interactive:
                value = default
            elif sensitive:
                value = getpass.getpass(f'{name} (hidden, at least 32 safe characters): ')
            else:
                value = input(f'{name}{" [" + default + "]" if default else ""}: ') or default
        if not value:
            raise ValueError(f'{name} is required; export it at runtime.')
        os.environ[name] = value
        return value

    source = os.environ.get('SECRET_SOURCE', 'local')
    keys = ('MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'JWT_SECRET')
    if source == 'aws':
        arn = runtime('SECRET_ARN')
        region = runtime('AWS_REGION')
        result = subprocess.run(
            ['aws', 'secretsmanager', 'get-secret-value', '--region', region,
             '--secret-id', arn, '--query', 'SecretString', '--output', 'text', '--no-cli-pager'],
            check=True, capture_output=True, text=True,
        )
        payload = json.loads(result.stdout)
        values = {key: payload[key] for key in keys}
        for key, value in values.items():
            os.environ[key] = str(value)
    elif source == 'local':
        values = {key: runtime(key, {'MYSQL_DATABASE': 'book_review_db', 'MYSQL_USER': 'bookreview_user'}.get(key, ''), sensitive='PASSWORD' in key or key == 'JWT_SECRET') for key in keys}
    else:
        raise ValueError('SECRET_SOURCE must be local or aws.')

    for key in keys:
        value = values[key]
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', value):
            raise ValueError(f'{key} must use letters, digits, underscores, or hyphens.')
        if key in ('MYSQL_DATABASE', 'MYSQL_USER'):
            limit = 32 if key == 'MYSQL_USER' else 64
            if len(value) > limit or value.lower() in ('root', 'mysql', 'sys', 'information_schema', 'performance_schema'):
                raise ValueError(f'{key} is not a valid application identifier.')
        elif len(value) < 32 and value != existing.get(key):
            raise ValueError(f'{key} must have at least 32 characters for new secrets.')
        if key in existing and value != existing[key] and os.environ.get('ALLOW_SECRET_UPDATE') != 'yes':
            raise ValueError(f'{key} changed. Follow the documented rotation procedure first; updating .env does not rotate MySQL users.')

    public_url = runtime('PUBLIC_URL')
    parsed = urlsplit(public_url)
    if parsed.scheme != 'http' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password or parsed.port not in (None, 80):
        raise ValueError('PUBLIC_URL must be an HTTP origin without path or trailing slash. This stack listens on port 80; TLS needs an additional configuration.')
    values.update({
        'PUBLIC_URL': public_url,
        'APP_IMAGE_TAG': runtime('APP_IMAGE_TAG', 'local'),
        'DB_VOLUME_NAME': runtime('DB_VOLUME_NAME', 'reading-room_db_data'),
        'NODE_IMAGE': runtime('NODE_IMAGE', 'node:22-alpine'),
        'MYSQL_IMAGE': runtime('MYSQL_IMAGE', 'mysql:8.4'),
        'NGINX_IMAGE': runtime('NGINX_IMAGE', 'nginxinc/nginx-unprivileged:stable-alpine'),
    })
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', values['APP_IMAGE_TAG']):
        raise ValueError('APP_IMAGE_TAG is not a valid image tag.')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]+', values['DB_VOLUME_NAME']):
        raise ValueError('DB_VOLUME_NAME is not a valid volume name.')
    for key, value in values.items():
        if '\n' in value or '\r' in value or '$' in value or '#' in value or ' ' in value:
            raise ValueError(f'{key} contains characters unsafe for an unquoted Compose env value.')
    os.umask(0o077)
    fd, temporary = tempfile.mkstemp(prefix='.env.', dir=root)
    try:
        with os.fdopen(fd, 'w') as output:
            output.write(''.join(f'{key}={value}\n' for key, value in values.items()))
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Protected .env written. No secret values displayed; no containers started.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError, FileNotFoundError) as error:
        if isinstance(error, subprocess.CalledProcessError):
            message = 'AWS secret retrieval failed. Check the region, instance role, and secret ARN.'
        elif isinstance(error, KeyError):
            message = 'Secrets Manager payload is missing a required key.'
        else:
            message = str(error)
        raise SystemExit(message)
