# Open Library Catalog Lookup

Maintainer: Saima Usman.

Signed-in readers can search titles in the upload form after entering at least
three characters. Select a suggestion to populate title, author, an available
description, and the Open Library work link. Descriptions remain editable;
manual entry remains available when catalog lookup fails.

Keyboard selection supports Arrow Up/Down, Enter, and Escape. Work-level catalog
records are not a promise of edition availability. Long descriptions are
excerpted to the 2000-character synopsis limit. This is catalog lookup, not
AI generation, an ebook download, or an audio-summary service.

## Provider Controls

- No paid AI subscription or API key is required.
- App search/detail endpoints require authentication and limit account requests.
- Provider requests are serialized at no more than one per second per backend process.
- Successful results are cached for ten minutes with a bounded 128-entry cache.
- Concurrent duplicate requests share the upstream result; the queue is bounded.
- Fixed provider URLs, catalog IDs, response sizes, and saved source URLs are validated.
- Redirects are rejected; summaries are rendered as text.

Selecting a suggestion preserves user-written synopsis text. Editing selected
title/author clears catalog association and an untouched automatic description.
The submit button waits for pending selected-description requests.

Nullable catalogId and sourceUrl fields are additive migrations. Unique catalog
IDs prevent duplicate work submissions under different spellings.
Multi-process deployments need coordinated provider limits/caching.

Catalog descriptions may carry rights restrictions. Review source permissions
before republishing or narrating third-party text.
[Open Library Search API](https://openlibrary.org/dev/docs/api/search)
and [API documentation](https://openlibrary.org/developers/api).
