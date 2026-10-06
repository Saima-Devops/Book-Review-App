# Book Shelf Catalog Suggestions

The upload form can search Open Library by title for signed-in users. Start
typing a title of at least three characters, then choose a suggestion using the
mouse or Arrow Up/Down and Enter. Escape dismisses the suggestions.

Selecting a result fills its title and author, fetches an available catalog
description, and adds a link to its Open Library work page. Descriptions remain
editable. A missing description is not fabricated: write your own synopsis.
Manual entry remains available when searches fail or return no matches.

This is catalog lookup, not AI generation, a free-book download, or a promise
that a particular edition is available. Results are work-level records; the
displayed year is the first publication year when supplied by the catalog.
Descriptions longer than 2,000 characters are excerpted to fit the form.

## Operation and Data Safety

- No API key or paid AI subscription is required.
- Search/detail endpoints require a valid app login. Limits are 30 requests per
  minute per account, with an upstream queue capped at four requests.
- Provider calls are serialized at no more than one request per second per
  backend process. Successful results are cached for ten minutes (128 entries),
  and repeated in-flight queries share a request. Avoid increasing worker counts
  without coordinating the provider limit across processes.
- Only fixed Open Library URLs are fetched. Catalog IDs and saved source URLs
  are validated; redirects and oversized responses are rejected.
- Summaries are rendered as text, not executable HTML. Existing user-written
  synopses are preserved when selecting a suggestion.
- Changes to a selected title or author clear its catalog association and an
  untouched auto-filled description. User-edited descriptions are retained.
- The upload button waits for the selected description request to finish.
- Nullable `catalogId` and `sourceUrl` fields are added at startup. Existing
  books/reviews/ownership are preserved. Catalog IDs are unique so the same work
  cannot be submitted repeatedly under different spellings.

Back up the database before deploying. Apply this through your existing manual
deployment process; no AWS action or hosting change is part of this feature.
The Compose project, volume, image and Terraform resource names deliberately
remain unchanged to avoid creating a second stack or losing the database.

API references: https://openlibrary.org/dev/docs/api/search and
https://openlibrary.org/developers/api.
