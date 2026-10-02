"""Offline configuration tests; never access AWS or the deployed database."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
KEYS = ('MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'JWT_SECRET')


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'scripts').mkdir()
        shutil.copy(ROOT / 'scripts/configure-env.py', self.root / 'scripts/configure-env.py')
        self.env = {key: value for key, value in os.environ.items() if key not in KEYS + (
            'PUBLIC_URL', 'SECRET_SOURCE', 'APP_IMAGE_TAG', 'DB_VOLUME_NAME', 'ALLOW_SECRET_UPDATE',
        )}
        self.env.update(
            SECRET_SOURCE='local', MYSQL_DATABASE='ci_books', MYSQL_USER='ci_user',
            MYSQL_ROOT_PASSWORD='r' * 32, MYSQL_PASSWORD='p' * 32, JWT_SECRET='j' * 32,
        )

    def configure(self, origin='http://127.0.0.1', **overrides):
        return subprocess.run(
            ['python3', str(self.root / 'scripts/configure-env.py'), '--non-interactive'],
            env={**self.env, 'PUBLIC_URL': origin, **overrides},
            capture_output=True, text=True, check=False,
        )

    def values(self):
        return dict(line.split('=', 1) for line in (self.root / '.env').read_text().splitlines())

    def stage_certificates(self):
        path = self.root / 'tls/active'
        path.mkdir(parents=True)
        for name in ('fullchain.pem', 'privkey.pem'):
            (path / name).touch()

    def test_http_writes_private_env_without_disclosing_secrets(self):
        result = self.configure()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.values()['COMPOSE_FILE'], 'docker-compose.yml')
        self.assertEqual((self.root / '.env').stat().st_mode & 0o777, 0o600)
        for key in KEYS[2:]:
            self.assertNotIn(self.env[key], result.stdout + result.stderr)

    def test_https_requires_staged_certificates(self):
        result = self.configure('https://127.0.0.1')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / '.env').exists())

    def test_https_and_rollback_preserve_secrets_image_and_database_volume(self):
        self.assertEqual(self.configure(APP_IMAGE_TAG='testcommit', DB_VOLUME_NAME='ci_existing').returncode, 0)
        before = self.values()
        self.stage_certificates()
        self.assertEqual(self.configure('https://127.0.0.1').returncode, 0)
        after = self.values()
        self.assertEqual(after['COMPOSE_FILE'], 'docker-compose.yml:docker-compose.https.yml')
        for key in KEYS + ('APP_IMAGE_TAG', 'DB_VOLUME_NAME'):
            self.assertEqual(before[key], after[key])
        self.assertEqual(self.configure().returncode, 0)
        self.assertEqual(self.values()['COMPOSE_FILE'], 'docker-compose.yml')

    def test_secret_change_is_refused_without_rotation_opt_in(self):
        self.assertEqual(self.configure().returncode, 0)
        before = (self.root / '.env').read_bytes()
        self.assertNotEqual(self.configure(MYSQL_PASSWORD='new' * 12).returncode, 0)
        self.assertEqual((self.root / '.env').read_bytes(), before)

    def test_invalid_origins_are_rejected(self):
        for origin in ('ftp://127.0.0.1', 'http://127.0.0.1/', 'https://127.0.0.1:80',
                       'http://127.0.0.1:443', 'http://reader@127.0.0.1', 'http://127.0.0.1?x=1'):
            with self.subTest(origin=origin):
                self.assertNotEqual(self.configure(origin).returncode, 0)

    def test_short_new_secret_is_rejected(self):
        self.assertNotEqual(self.configure(JWT_SECRET='short').returncode, 0)


@unittest.skipUnless(shutil.which('docker'), 'Docker Compose CLI is required; no daemon needed')
class ComposeTests(unittest.TestCase):
    def config(self, tls=False):
        env = dict(os.environ, PUBLIC_URL='https://127.0.0.1' if tls else 'http://127.0.0.1',
                   MYSQL_DATABASE='ci_books', MYSQL_USER='ci_user', MYSQL_ROOT_PASSWORD='r' * 32,
                   MYSQL_PASSWORD='p' * 32, JWT_SECRET='j' * 32, DB_VOLUME_NAME='ci_test_data',
                   APP_IMAGE_TAG='ci-test')
        command = ['docker', 'compose', '-f', 'docker-compose.yml']
        if tls:
            command += ['-f', 'docker-compose.https.yml']
        result = subprocess.run(command + ['config', '--format', 'json'], cwd=ROOT,
                                env=env, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def test_private_networks_persistence_and_hardening(self):
        config = self.config()
        self.assertTrue(config['networks']['back-tier']['internal'])
        self.assertEqual(config['volumes']['db_data']['name'], 'ci_test_data')
        services = config['services']
        self.assertEqual(set(services['database']['networks']), {'back-tier'})
        self.assertEqual(set(services['backend']['networks']), {'front-tier', 'back-tier'})
        for name in ('frontend', 'backend', 'database'):
            self.assertFalse(services[name].get('ports'))
        for name in ('reverse-proxy', 'frontend', 'backend'):
            self.assertTrue(services[name]['read_only'])
            self.assertIn('ALL', services[name]['cap_drop'])
            self.assertIn('no-new-privileges:true', services[name]['security_opt'])
            self.assertEqual(services[name]['restart'], 'unless-stopped')
        for service in services.values():
            self.assertIn('healthcheck', service)
            self.assertEqual(service['logging']['options']['max-size'], '10m')

    def test_tls_overlay_adds_port_and_read_only_certificate_mount(self):
        config = self.config(tls=True)
        proxy = config['services']['reverse-proxy']
        self.assertEqual({str(port['published']) for port in proxy['ports']}, {'80', '443'})
        mounts = {mount['target']: mount for mount in proxy['volumes']}
        self.assertTrue(mounts['/etc/nginx/tls']['read_only'])
        self.assertTrue(mounts['/etc/nginx/nginx.conf']['read_only'])
        self.assertEqual(config['services']['backend']['environment']['ALLOWED_ORIGINS'], 'https://127.0.0.1')
        self.assertEqual(config['services']['database'], self.config()['services']['database'])


if __name__ == '__main__':
    unittest.main()
