"""Exercise Docker Hub delivery with fake CLIs; no network or registry writes."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
SHA = 'a' * 40


class PublishingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.bin = self.directory / 'bin'
        self.bin.mkdir()
        self.log = self.directory / 'commands.jsonl'
        self.summary = self.directory / 'summary.md'
        self.mock('docker', '''
            import json, os, pathlib, sys
            args = sys.argv[1:]
            record = {'args': args, 'config': os.environ.get('DOCKER_CONFIG')}
            if args[0] == 'login':
                record['stdin_ok'] = sys.stdin.read() == 'fake-registry-token'
                pathlib.Path(os.environ['DOCKER_CONFIG'], 'config.json').write_text('{}')
            with open(os.environ['COMMAND_LOG'], 'a') as log:
                log.write(json.dumps(record) + '\\n')
            if args[:2] == ['image', 'inspect'] and os.environ.get('FAIL_INSPECT', '') and os.environ['FAIL_INSPECT'] in args[2]:
                sys.exit(1)
            if args[:2] == ['image', 'push'] and os.environ.get('FAIL_PUSH', '') and os.environ['FAIL_PUSH'] in args[2]:
                sys.exit(1)
            if args[0] == 'login' and os.environ.get('FAIL_LOGIN'):
                sys.exit(1)
        ''')
        self.mock('git', '''
            import os, sys
            if sys.argv[1:] != ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']:
                sys.exit(1)
            print(os.environ['MAIN_SHA'] + '\\trefs/heads/main')
        ''')
        self.env = dict(os.environ, PATH=f'{self.bin}{os.pathsep}{os.environ["PATH"]}',
                        GITHUB_ACTIONS='true', GITHUB_EVENT_NAME='push',
                        GITHUB_REF='refs/heads/main', GITHUB_SHA=SHA,
                        GITHUB_RUN_NUMBER='123', GITHUB_RUN_ATTEMPT='1',
                        APP_IMAGE_TAG=f'ci-{SHA}', DOCKERHUB_USERNAME='saim2026',
                        DOCKERHUB_TOKEN='fake-registry-token', RUNNER_TEMP=str(self.directory),
                        COMMAND_LOG=str(self.log), GITHUB_STEP_SUMMARY=str(self.summary),
                        MAIN_SHA=SHA, FAIL_LOGIN='', FAIL_INSPECT='', FAIL_PUSH='')

    def mock(self, name, source):
        path = self.bin / name
        path.write_text('#!/usr/bin/env python3\n' + textwrap.dedent(source))
        path.chmod(0o755)

    def run_publisher(self, **overrides):
        return subprocess.run(['bash', str(ROOT / 'scripts/publish-images.sh')],
                              cwd=ROOT, env={**self.env, **overrides},
                              capture_output=True, text=True, check=False)

    def commands(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def pushes(self):
        return [record['args'][2] for record in self.commands()
                if record['args'][:2] == ['image', 'push']]

    def test_publish_exact_tested_images_with_versions_before_latest(self):
        result = self.run_publisher()
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = []
        for service in ('frontend', 'backend', 'proxy'):
            expected += [f'saim2026/book-shelf:{service}-build-123-1',
                         f'saim2026/book-shelf:{service}-sha-{SHA}']
        expected += [f'saim2026/book-shelf:{service}-latest'
                     for service in ('frontend', 'backend', 'proxy')]
        self.assertEqual(self.pushes(), expected)
        self.assertEqual({tag.split(':')[0] for tag in self.pushes()}, {'saim2026/book-shelf'})
        self.assertEqual(len(self.pushes()), len(set(self.pushes())))
        commands = self.commands()
        self.assertEqual([record['args'] for record in commands[:3]],
                         [['image', 'inspect', f'reading-room-{service}:ci-{SHA}']
                          for service in ('frontend', 'backend', 'proxy')])
        for record in commands:
            if record['args'][:2] == ['image', 'tag']:
                self.assertTrue(record['args'][2].endswith(f':ci-{SHA}'))
        login = next(record for record in commands if record['args'][0] == 'login')
        self.assertTrue(login['stdin_ok'])
        self.assertIn('--password-stdin', login['args'])
        self.assertFalse(Path(login['config']).exists())
        self.assertNotIn('fake-registry-token', result.stdout + result.stderr + self.log.read_text())
        self.assertIn('build-123-1', self.summary.read_text())
        self.assertNotIn('build', [record['args'][0] for record in commands])

    def test_pr_manual_and_non_main_runs_never_authenticate(self):
        for overrides in ({'GITHUB_EVENT_NAME': 'pull_request'},
                          {'GITHUB_EVENT_NAME': 'workflow_dispatch'},
                          {'GITHUB_REF': 'refs/heads/feature'}):
            with self.subTest(overrides=overrides):
                result = self.run_publisher(DOCKERHUB_TOKEN='', **overrides)
                self.assertEqual(result.returncode, 0)
                self.assertEqual(self.commands(), [])

    def test_reject_missing_credentials_wrong_namespace_and_invalid_tags(self):
        for overrides in ({'DOCKERHUB_TOKEN': ''}, {'DOCKERHUB_USERNAME': ''},
                          {'DOCKERHUB_USERNAME': 'other-user'}, {'GITHUB_SHA': 'bad'},
                          {'GITHUB_RUN_NUMBER': '123;echo'}, {'GITHUB_RUN_ATTEMPT': '0'},
                          {'APP_IMAGE_TAG': 'untested'}, {'GITHUB_ACTIONS': 'false'}):
            with self.subTest(overrides=overrides):
                self.assertNotEqual(self.run_publisher(**overrides).returncode, 0)
                self.assertEqual(self.commands(), [])

    def test_missing_image_prevents_login_and_publication(self):
        self.assertNotEqual(self.run_publisher(FAIL_INSPECT='backend').returncode, 0)
        self.assertEqual(self.pushes(), [])
        self.assertFalse(any(record['args'][0] == 'login' for record in self.commands()))

    def test_failed_version_push_never_promotes_latest_and_cleans_credentials(self):
        self.assertNotEqual(self.run_publisher(FAIL_PUSH=':backend-build-').returncode, 0)
        self.assertFalse(any(tag.endswith('-latest') for tag in self.pushes()))
        config = next(record['config'] for record in self.commands() if record['args'][0] == 'login')
        self.assertFalse(Path(config).exists())
        self.assertFalse(self.summary.exists())

    def test_old_commit_does_not_overwrite_latest(self):
        result = self.run_publisher(MAIN_SHA='b' * 40)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.pushes()), 6)
        self.assertFalse(any(tag.endswith('-latest') for tag in self.pushes()))
        self.assertIn('false', self.summary.read_text())

    def test_rerun_uses_a_distinct_build_tag(self):
        self.assertEqual(self.run_publisher(GITHUB_RUN_ATTEMPT='2').returncode, 0)
        self.assertTrue(any(tag.endswith('-build-123-2') for tag in self.pushes()))
        self.assertFalse(any(tag.endswith('-build-123-1') for tag in self.pushes()))

    def test_failed_login_does_not_push_and_cleans_credentials(self):
        self.assertNotEqual(self.run_publisher(FAIL_LOGIN='yes').returncode, 0)
        self.assertEqual(self.pushes(), [])
        config = next(record['config'] for record in self.commands() if record['args'][0] == 'login')
        self.assertFalse(Path(config).exists())


if __name__ == '__main__':
    unittest.main()
