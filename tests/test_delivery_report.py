"""Verify final delivery messages with synthetic statuses; no GitHub or Docker writes."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('delivery_report', ROOT / 'scripts/report-delivery.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeliveryReportTests(unittest.TestCase):
    def setUp(self):
        self.env = dict(BACKEND_RESULT='success', FRONTEND_RESULT='success', DOCKER_RESULT='success',
                        PUBLISH_OUTCOME='success', PUBLISHED='true', LATEST_UPDATED='true',
                        GITHUB_EVENT_NAME='push', GITHUB_REF='refs/heads/main',
                        GITHUB_RUN_NUMBER='8', GITHUB_RUN_ATTEMPT='2', GITHUB_SHA='a' * 40)

    def report(self, **overrides):
        return module.report({**self.env, **overrides})

    def test_success_displays_full_deployable_references_and_latest(self):
        text, annotation, notice, code = self.report()
        self.assertEqual(code, 0)
        self.assertEqual(annotation, 'notice')
        self.assertIn('PUSHED AND VERIFIED', text)
        for service in ('backend', 'frontend', 'proxy'):
            self.assertIn(f'saim2026/book-shelf:{service}-build-8-2', text)
            self.assertIn(f'saim2026/book-shelf:{service}-latest', text)
        self.assertIn('Latest aliases updated', text)

    def test_validation_only_run_warns_images_were_not_pushed(self):
        text, annotation, _, code = self.report(GITHUB_EVENT_NAME='workflow_dispatch',
                                               PUBLISH_OUTCOME='skipped', PUBLISHED='')
        self.assertEqual(code, 0)
        self.assertEqual(annotation, 'warning')
        self.assertIn('IMAGES NOT PUSHED', text)
        self.assertIn('Validation-only', text)
        self.assertNotIn('backend-build-8-2', text)

    def test_manual_opt_in_reports_publication(self):
        text, _, _, code = self.report(GITHUB_EVENT_NAME='workflow_dispatch', PUBLISH_IMAGES='true')
        self.assertEqual(code, 0)
        self.assertIn('PUSHED AND VERIFIED', text)

    def test_failed_checks_never_offer_images_for_deployment(self):
        for key in ('BACKEND_RESULT', 'FRONTEND_RESULT', 'DOCKER_RESULT'):
            for value in ('failure', 'cancelled', 'skipped'):
                with self.subTest(key=key, value=value):
                    text, annotation, _, code = self.report(**{key: value, 'PUBLISHED': '', 'PUBLISH_OUTCOME': ''})
                    self.assertEqual(code, 1)
                    self.assertEqual(annotation, 'error')
                    self.assertIn('IMAGES NOT PUSHED', text)
                    self.assertNotIn('backend-build-8-2', text)

    def test_partial_publication_is_explicit(self):
        for outcome in ('failure', 'cancelled'):
            text, _, _, code = self.report(PUBLISH_OUTCOME=outcome, PUBLISHED='', DOCKER_RESULT='failure')
            self.assertEqual(code, 1)
            self.assertIn('Some tags may have been pushed', text)
            self.assertIn('partial release', text)

    def test_unexpected_publish_skip_fails_the_report(self):
        text, _, _, code = self.report(PUBLISH_OUTCOME='skipped', PUBLISHED='')
        self.assertEqual(code, 1)
        self.assertIn('Publishing was required', text)

    def test_older_commit_does_not_claim_latest_updated(self):
        text, _, _, code = self.report(LATEST_UPDATED='false')
        self.assertEqual(code, 0)
        self.assertIn('Latest aliases were NOT updated', text)
        self.assertNotIn('Latest aliases updated:', text)

    def test_failure_after_push_is_not_hidden(self):
        text, annotation, _, code = self.report(DOCKER_RESULT='failure')
        self.assertEqual(code, 1)
        self.assertEqual(annotation, 'error')
        self.assertIn('Images were pushed', text)
        self.assertIn('later step failed', text)

    def test_invalid_identifiers_never_become_image_references(self):
        for key, value in (('GITHUB_SHA', 'bad'), ('GITHUB_RUN_NUMBER', '8;command'), ('GITHUB_RUN_ATTEMPT', '0')):
            text, _, _, code = self.report(**{key: value})
            self.assertEqual(code, 1)
            self.assertNotIn('Deploy this version', text)

    def test_pull_requests_cannot_claim_publication(self):
        text, _, _, code = self.report(GITHUB_EVENT_NAME='pull_request', GITHUB_REF='refs/pull/1/merge',
                                       PUBLISH_OUTCOME='skipped', PUBLISHED='')
        self.assertEqual(code, 0)
        self.assertIn('Pull requests never publish', text)


if __name__ == '__main__':
    unittest.main()
