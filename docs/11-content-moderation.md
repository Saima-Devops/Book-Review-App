# Content Reporting and Moderation

Maintainer: Saima Usman.

## Reporting

Signed-in readers can report a book or review from the book detail page.
Reasons include spam, harassment, inappropriate content, copyright concerns,
misleading content, and other concerns. Optional details are limited to 2000
characters. Submission does not automatically hide or delete content.

Only administrators can read the report queue. An account can report each
target once, including after resolution. Duplicate attempts receive a clear
message. Limits are ten attempts per account per hour per backend process;
counters reset at restart and are not shared between replicas.

## Administrator Access

No account is an administrator by default. After JWT/session validation, the
backend compares the account ID with ADMIN_USER_IDS. Names, emails, signup data,
frontend state, and client role claims cannot grant access.

Example backend-only configuration:

```text
ADMIN_USER_IDS=7
```

The example is not a universal administrator ID. Verify the intended account
in the deployment database before granting access. Multiple IDs use a
comma-separated list; empty disables moderation. Do not copy CI's synthetic
administrator setting into a live deployment.

In Northflank, save the backend runtime setting and redeploy the new backend
and frontend images. Authorized users see Moderation in navigation and can
open /admin/reports. For Compose, the protected root .env supplies the same
variable; the environment helper preserves it across runs.

## Decisions

The queue has Pending, Dismissed, and Removed filters, refresh, and 20-record
pagination. Each report includes its original content snapshot and optional
reporter context. Check current content before acting because authors may edit it.

- Dismiss: retain content and resolve the selected report.
- Remove review: delete that review, recalculate the book rating, and resolve related pending reports.
- Remove book: delete the book and its reviews, resolving all pending reports for that book.

Removal requires confirmation. Decisions record administrator ID, timestamp,
status, and note. Already-resolved decisions are rejected. Already-deleted
targets can be resolved without affecting unrelated content.

Actions are transactional. Failures roll back moderation changes; retry after
reviewing the error. Removal has no in-app undo. Backup-based recovery must
account for subsequent writes.

## Data and Security

Reports is added at startup without resetting other tables. Snapshots survive
content deletion for audit purposes. Restrict database/backup access and define
retention and privacy policies for this potentially sensitive information.
Reports and moderation notes are rendered as text.

Existing owner-only book/review deletion permissions remain unchanged.
Administration adds explicit moderation powers, not ownership of other users' books.
Initial sample books are not recreated when Books is empty but Reports exists.

## Testing

Unit tests cover validation, forged fields, authorization configuration,
duplicates, queues, removal, ratings, audit fields, and failure paths. CI integration
tests use a disposable MySQL database. Moderation removal tests must not target
real books, user records, or the live Aiven service.
