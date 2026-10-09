"""Check backup safety with a fake MySQL client; never connects to a database."""
import gzip
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AivenBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.client = self.home / 'mysqldump'
        self.log = self.home / 'calls.jsonl'
        self.ca = self.home / 'certificate with spaces.pem'
        self.ca.write_text('synthetic CA fixture, not a real certificate')
        self.client.write_text('#!/usr/bin/env python3\n' + textwrap.dedent('''
            import json, os, sys
            if sys.argv[1:] == ['--version']:
                print('mysqldump Ver 8.4'); sys.exit(0)
            with open(os.environ['DUMP_LOG'], 'a') as stream:
                stream.write(json.dumps({'args': sys.argv[1:], 'mysql_pwd': os.environ.get('MYSQL_PWD')}) + '\\n')
            print('-- synthetic dump')
            print('CREATE TABLE Books (id INT);')
            print('INSERT INTO Books VALUES (1);')
            if os.environ.get('FAIL_DUMP'):
                print('Synthetic database connection failed', file=sys.stderr); sys.exit(2)
        '''))
        self.client.chmod(0o755)
        self.config = self.home / '.config/book-shelf/aiven-backup.conf'
        self.backups = self.home / 'backups'
        self.env = dict(os.environ, HOME=str(self.home), AIVEN_HOST='db.example.test',
                        AIVEN_PORT='24720', AIVEN_USER='avnadmin', AIVEN_DATABASE='book_shelf',
                        AIVEN_CA=str(self.ca), AIVEN_MYSQLDUMP=str(self.client),
                        AIVEN_BACKUP_CLIENT='auto', AIVEN_MYSQL_IMAGE='',
                        AIVEN_BACKUP_DIR=str(self.backups), AIVEN_BACKUP_CONFIG=str(self.config),
                        DUMP_LOG=str(self.log), FAIL_DUMP='', MYSQL_PWD='must-not-be-used')

    def run_backup(self, input='', **overrides):
        args = overrides.pop('args', [])
        return subprocess.run(['bash', str(ROOT / 'scripts/backup-aiven.sh'), *args], cwd=ROOT,
                              env={**self.env, **overrides}, input=input, text=True,
                              capture_output=True, timeout=15, check=False)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def archives(self):
        return list(self.backups.glob('*/book-shelf.sql.gz'))

    def test_success_uses_verified_tls_and_private_completed_archive(self):
        result = self.run_backup()
        self.assertEqual(result.returncode, 0, result.stderr)
        archive, = self.archives()
        self.assertIn('CREATE TABLE Books', gzip.decompress(archive.read_bytes()).decode())
        self.assertIn(str(archive), result.stdout)
        self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(archive.parent.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o600)
        args = self.calls()[0]['args']
        self.assertIn('--ssl-mode=VERIFY_IDENTITY', args)
        self.assertIn(f'--ssl-ca={self.ca}', args)
        self.assertIn('--single-transaction', args)
        self.assertFalse(any(arg.startswith('--connect-timeout') for arg in args))
        self.assertIn('--skip-add-drop-table', args)
        self.assertIn('--password', args)
        self.assertEqual(args[-1], 'book_shelf')
        self.assertIsNone(self.calls()[0]['mysql_pwd'])
        self.assertNotIn('must-not-be-used', self.config.read_text() + result.stdout + result.stderr)
        self.assertFalse(list(self.backups.glob('*/.*partial')))

    def test_failed_dump_discards_partial_archive_and_preserves_old_backup(self):
        self.assertEqual(self.run_backup().returncode, 0)
        old, = self.archives()
        before = old.read_bytes()
        result = self.run_backup(FAIL_DUMP='yes')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.archives(), [old])
        self.assertEqual(old.read_bytes(), before)
        self.assertFalse(list(self.backups.glob('*/.*partial')))
        self.assertIn('Do not deploy yet', result.stderr)
        self.assertNotIn('Backup created', result.stdout)

    def test_saved_settings_are_reused_without_connection_prompts(self):
        self.assertEqual(self.run_backup().returncode, 0)
        result = self.run_backup(**{key: '' for key in ('AIVEN_HOST', 'AIVEN_PORT', 'AIVEN_USER', 'AIVEN_DATABASE', 'AIVEN_CA')})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.archives()), 2)
        self.assertIn('--host=db.example.test', self.calls()[-1]['args'])

    def test_environment_overrides_saved_settings(self):
        self.assertEqual(self.run_backup().returncode, 0)
        self.assertEqual(self.run_backup(AIVEN_HOST='new.example.test', AIVEN_DATABASE='new_books').returncode, 0)
        self.assertIn('--host=new.example.test', self.calls()[-1]['args'])
        self.assertEqual(self.calls()[-1]['args'][-1], 'new_books')

    def test_missing_values_prompt_and_remember_input(self):
        result = self.run_backup(input=f'db.example.test\n24720\n\n\n{self.ca}\n',
                                 **{key: '' for key in ('AIVEN_HOST', 'AIVEN_PORT', 'AIVEN_USER', 'AIVEN_DATABASE', 'AIVEN_CA')})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('database=book_shelf', self.config.read_text())

    def test_configure_edits_saved_settings(self):
        self.assertEqual(self.run_backup().returncode, 0)
        result = self.run_backup(input='changed.example.test\n\n\n\n\n', args=['--configure'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('host=changed.example.test', self.config.read_text())

    def test_missing_client_fails_before_any_dump_or_backup(self):
        result = self.run_backup(AIVEN_MYSQLDUMP=str(self.home / 'absent'))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('brew install mysql-client@8.4', result.stderr)
        self.assertEqual(self.calls(), [])
        self.assertFalse(self.config.exists())

    def test_homebrew_client_is_detected_without_path_export(self):
        bin_dir = self.home / 'bin'
        bin_dir.mkdir()
        (bin_dir / 'python3').symlink_to(sys.executable)
        prefix = self.home / 'formula'
        (prefix / 'bin').mkdir(parents=True)
        (prefix / 'bin/mysqldump').symlink_to(self.client)
        brew = bin_dir / 'brew'
        brew.write_text('#!/bin/bash\nif [[ "$1" = --prefix && "$2" = mysql-client@8.4 ]]; then printf "%s\\n" "$TEST_BREW_PREFIX"; else exit 1; fi\n')
        brew.chmod(0o755)
        result = self.run_backup(AIVEN_MYSQLDUMP='', PATH=f'{bin_dir}:/usr/bin:/bin', TEST_BREW_PREFIX=str(prefix))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.archives()), 1)

    def test_compression_failure_does_not_publish_archive(self):
        bin_dir = self.home / 'bin'
        bin_dir.mkdir()
        compressor = bin_dir / 'gzip'
        compressor.write_text('#!/bin/bash\ncat >/dev/null\nexit 1\n')
        compressor.chmod(0o755)
        result = self.run_backup(PATH=f'{bin_dir}:{os.environ["PATH"]}')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.archives(), [])
        self.assertFalse(list(self.backups.glob('*/.*partial')))

    def test_invalid_connection_settings_do_not_start_dump(self):
        for overrides in ({'AIVEN_PORT': '0'}, {'AIVEN_PORT': '65536'}, {'AIVEN_PORT': 'abc'},
                          {'AIVEN_HOST': 'https://db.test'}, {'AIVEN_DATABASE': '--all-databases'},
                          {'AIVEN_USER': 'user\npassword=secret'}):
            with self.subTest(overrides=overrides):
                self.assertNotEqual(self.run_backup(**overrides).returncode, 0)
                self.assertEqual(self.calls(), [])

    def test_unreadable_ca_fails_before_dump(self):
        result = self.run_backup(AIVEN_CA=str(self.home / 'absent.pem'))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_config_is_never_executed(self):
        self.config.parent.mkdir(parents=True)
        marker = self.home / 'must-not-exist'
        self.config.write_text(f'command=$(touch "{marker}")\n')
        self.assertEqual(self.run_backup().returncode, 0)
        self.assertFalse(marker.exists())

    def test_help_and_unknown_options_do_not_connect(self):
        result = self.run_backup(args=['--help'])
        self.assertEqual(result.returncode, 0)
        self.assertIn('Never saves passwords', result.stdout)
        self.assertNotEqual(self.run_backup(args=['--unknown']).returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_noninteractive_missing_settings_fail_clearly(self):
        result = self.run_backup(AIVEN_HOST='')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Run interactively', result.stderr)
        self.assertEqual(self.calls(), [])

    def docker_env(self, **overrides):
        bin_dir = self.home / 'docker-bin'
        bin_dir.mkdir(exist_ok=True)
        python = bin_dir / 'python3'
        if not python.exists(): python.symlink_to(sys.executable)
        docker = bin_dir / 'docker'
        docker.write_text('#!/usr/bin/env python3\n' + textwrap.dedent('''
            import json, os, sys
            args = sys.argv[1:]
            record = {'args': args}
            if args[0] == 'run':
                payload = sys.stdin.read()
                record['credential_valid'] = payload == os.environ['EXPECTED_CNF']
                record['password_in_env'] = os.environ.get('password')
                record['mysql_pwd'] = os.environ.get('MYSQL_PWD')
            with open(os.environ['DUMP_LOG'], 'a') as stream:
                stream.write(json.dumps(record) + '\\n')
            if args[0] == 'info': sys.exit(1 if os.environ.get('DOCKER_DOWN') else 0)
            if args[:2] == ['image', 'inspect']:
                sys.exit(0 if args[2] == os.environ['CACHED_IMAGE'] else 1)
            if args[0] == 'pull': sys.exit(1 if os.environ.get('FAIL_PULL') else 0)
            if args[0] == 'run':
                if not record['credential_valid']: sys.exit(3)
                print('-- synthetic Docker dump')
                print('CREATE TABLE Books (id INT);')
                sys.exit(2 if os.environ.get('FAIL_DUMP') else 0)
            sys.exit(4)
        '''))
        docker.chmod(0o755)
        return dict(AIVEN_MYSQLDUMP='', AIVEN_BACKUP_CLIENT='auto',
                    PATH=f'{bin_dir}:/usr/bin:/bin', CACHED_IMAGE='mysql:8.4',
                    EXPECTED_CNF='[client]\npassword="synthetic-password"\n',
                    DOCKER_DOWN='', FAIL_PULL='', password='inherited-must-not-leak', **overrides)

    def test_docker_is_preferred_and_keeps_credentials_out_of_arguments_and_env(self):
        result = self.run_backup(input='synthetic-password\n', **self.docker_env())
        self.assertEqual(result.returncode, 0, result.stderr)
        archive, = self.archives()
        self.assertIn('CREATE TABLE Books', gzip.decompress(archive.read_bytes()).decode())
        run, = [call for call in self.calls() if call['args'][0] == 'run']
        args = run['args']
        self.assertTrue(run['credential_valid'])
        self.assertIsNone(run['password_in_env'])
        self.assertIsNone(run['mysql_pwd'])
        self.assertNotIn('-t', args)
        for flag in ('--rm', '-i', '--read-only', '--pull=never', '--cap-drop=ALL'):
            self.assertIn(flag, args)
        self.assertTrue(any(arg.endswith('/.ca.pem:/certs/ca.pem:ro') for arg in args))
        self.assertFalse(list(self.backups.glob('*/.ca.pem')))
        self.assertIn('--ssl-ca=/certs/ca.pem', args)
        self.assertIn('--ssl-mode=VERIFY_IDENTITY', args)
        self.assertFalse(any(arg.startswith('--connect-timeout') for arg in args))
        self.assertIn('999:999', args)
        self.assertNotIn('synthetic-password', json.dumps(args) + result.stdout + result.stderr + self.config.read_text())
        self.assertFalse(any(call['args'][0] == 'pull' for call in self.calls()))

    def test_cached_mysql_8_is_reused_without_download(self):
        env = self.docker_env()
        env['CACHED_IMAGE'] = 'mysql:8'
        result = self.run_backup(input='synthetic-password\n', **env)
        self.assertEqual(result.returncode, 0, result.stderr)
        run = next(call for call in self.calls() if call['args'][0] == 'run')
        self.assertIn('mysql:8', run['args'])
        self.assertFalse(any(call['args'][0] == 'pull' for call in self.calls()))

    def test_missing_image_is_downloaded_once(self):
        env = self.docker_env()
        env['CACHED_IMAGE'] = ''
        result = self.run_backup(input='synthetic-password\n', **env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([call['args'] for call in self.calls() if call['args'][0] == 'pull'], [['pull', 'mysql:8.4']])

    def test_stopped_docker_explains_how_to_continue(self):
        env = self.docker_env()
        env['DOCKER_DOWN'] = 'yes'
        result = self.run_backup(**env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Open Docker Desktop', result.stderr)
        self.assertFalse(any(call['args'][0] == 'run' for call in self.calls()))

    def test_failed_docker_download_does_not_create_a_backup(self):
        env = self.docker_env()
        env.update(CACHED_IMAGE='', FAIL_PULL='yes')
        result = self.run_backup(**env)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.config.exists())
        self.assertFalse(any(call['args'][0] == 'run' for call in self.calls()))

    def test_failed_docker_dump_removes_partial_archive(self):
        result = self.run_backup(input='synthetic-password\n', FAIL_DUMP='yes', **self.docker_env())
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.archives(), [])
        self.assertFalse(list(self.backups.glob('*/.*partial')))

    def test_password_special_characters_are_escaped_for_client_configuration(self):
        env = self.docker_env()
        env['EXPECTED_CNF'] = '[client]\npassword="quote\\"slash\\\\#tab\\t"\n'
        result = self.run_backup(input='quote"slash\\#tab\t\n', **env)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_password_leading_and_trailing_spaces_are_preserved(self):
        env = self.docker_env()
        env['EXPECTED_CNF'] = '[client]\npassword="  spaced password  "\n'
        result = self.run_backup(input='  spaced password  \n', **env)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_docker_password_never_starts_container(self):
        result = self.run_backup(**self.docker_env())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('password is required', result.stderr)
        self.assertFalse(any(call['args'][0] == 'run' for call in self.calls()))


if __name__ == '__main__':
    unittest.main()
