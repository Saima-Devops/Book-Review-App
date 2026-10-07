"""Write the final GitHub delivery summary without registry credentials or network access."""
import os
from pathlib import Path
import re
import sys


def report(env):
    results = [env.get(key, '') for key in ('BACKEND_RESULT', 'FRONTEND_RESULT', 'DOCKER_RESULT')]
    passed = all(result == 'success' for result in results)
    requested = env.get('GITHUB_REF') == 'refs/heads/main' and (
        env.get('GITHUB_EVENT_NAME') == 'push' or
        (env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and env.get('PUBLISH_IMAGES') == 'true'))
    published = env.get('PUBLISHED') == 'true' and env.get('PUBLISH_OUTCOME') == 'success'
    number, attempt, sha = (env.get(key, '') for key in ('GITHUB_RUN_NUMBER', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA'))
    valid = bool(re.fullmatch(r'[1-9][0-9]*', number) and re.fullmatch(r'[1-9][0-9]*', attempt)
                 and re.fullmatch(r'[0-9a-f]{40}', sha))
    lines = ['# Docker Hub Delivery Report', '']
    code = 0
    if published and requested and valid:
        lines += ['**IMAGES PUSHED AND VERIFIED ON DOCKER HUB**', '',
                  f'Tested commit: `{sha}`', '',
                  '| Service | Deploy this version | Commit reference |', '| --- | --- | --- |']
        for service in ('backend', 'frontend', 'proxy'):
            base = f'saim2026/book-shelf:{service}'
            lines.append(f'| {service} | `{base}-build-{number}-{attempt}` | `{base}-sha-{sha}` |')
        lines += ['', '[Docker Hub repository](https://hub.docker.com/r/saim2026/book-shelf/tags)', '']
        if env.get('LATEST_UPDATED') == 'true':
            lines += ['Latest aliases updated:', '', '```text',
                      *[f'saim2026/book-shelf:{service}-latest' for service in ('backend', 'frontend', 'proxy')], '```']
        else:
            lines += ['**Latest aliases were NOT updated:** main advanced before promotion. '
                      'The versioned images above were published; do not assume they are the newest main release.']
        lines += ['', 'Back up the database before rollout. Deploy matching backend and frontend build tags, backend first.',
                  'Publishing does not automatically deploy to Northflank.']
        if not passed:
            lines += ['', '**Pipeline did not complete successfully. Images were pushed, '
                      'but a later step failed or was cancelled. Resolve it before deployment.**']
            code = 1
        annotation = 'notice' if passed else 'error'
        notice = 'Images pushed and verified: ' + ', '.join(
            f'saim2026/book-shelf:{service}-build-{number}-{attempt}' for service in ('backend', 'frontend', 'proxy'))
    else:
        lines += ['**IMAGES NOT PUSHED / NO COMPLETE VERIFIED RELEASE**', '']
        if env.get('PUBLISH_OUTCOME') in ('failure', 'cancelled'):
            reason = ('Docker Hub publishing failed or was cancelled. Some tags may have been pushed before the failure; '
                      'do not deploy a partial release. Inspect the CD publishing step.')
            code = 1
        elif not passed:
            reason = 'Required checks failed, were cancelled, or did not run. No complete publication was confirmed.'
            code = 1
        elif not requested:
            reason = ('Validation-only run: publishing was not requested. Push to main, or run this workflow on main '
                      'with "Publish tested images to Docker Hub" checked. Pull requests never publish.')
        else:
            reason = 'Publishing was required but no complete verified publication was reported. Inspect the CD publishing step.'
            code = 1
        lines += [reason, '', 'No new image references are offered for deployment. Existing Docker Hub tags are not proof of this release.']
        annotation, notice = ('error' if code else 'warning'), reason
    lines += ['', '| Check | Result |', '| --- | --- |',
              *[f'| {name} | {result or "not available"} |' for name, result in zip(('Backend', 'Frontend', 'Docker integration'), results)],
              f'| Publishing | {env.get("PUBLISH_OUTCOME") or "not started"} |', '']
    return '\n'.join(lines), annotation, notice, code


if __name__ == '__main__':
    text, annotation, notice, code = report(os.environ)
    print(text)
    print(f'::{annotation} title=Docker Hub Delivery::{notice}')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as summary:
            summary.write(text)
    sys.exit(code)
