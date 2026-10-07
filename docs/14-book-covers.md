# Book Covers

Developed and maintained by Saima Usman.

## Upload and Preview

Cover upload is optional when adding a new book. Signed-in readers select
Upload cover, choose an image, review its preview, and select Use cover.
Upload book saves the book and cover together. Cancel preserves the previous
selection; Remove clears the draft image. Use only images that may legally be
shared. This feature does not upload ebooks or extract covers from websites.

The preview window accepts JPG, PNG, and WebP files up to 5 MB. The browser
prepares a compressed JPEG before submission. Books without an uploaded cover
retain their existing generated cover. Uploaded covers appear in the collection
and on the book detail page. Replacing covers on existing books is not supported.

## Validation and Storage

The backend independently checks MIME type, file signatures, valid decoding,
and a maximum of 12 million source pixels. Animated images are rejected. Sharp
removes metadata, applies orientation, and resizes within 900 by 1350 pixels
without enlarging the received image. The stored JPEG is limited to 256 KiB.
Cover submissions accept at most 512 KiB of decoded input; book JSON requests
are limited to 768 KiB. Two concurrent conversions are allowed per backend
process, and book creation is limited to ten requests per account per minute.

Images are stored as base64 in Books.coverData with a SHA-256 coverVersion.
Base64 adds approximately one-third to the binary size. Monitor database capacity,
especially on a free database plan. No local upload volume, object store, or
additional secrets are needed. Existing database backups include the covers.

The backend applies additive nullable columns on startup. Back up first and
ensure the database account has schema alteration permissions. Deploy the
cover-enabled backend before the frontend, using matching published image tags.

## Access and Deletion

GET /api/books/:id/cover serves a public JPEG with a versioned cache URL.
Book list and detail JSON exclude the image payload. Invalid or missing images
return an error rather than serving user-provided HTML or SVG. Ordinary book
deletion remains uploader-only; administrator moderation may remove reported
books. Removing a book also removes its cover because both share one row.

## Checks

Backend tests cover accepted image formats, resizing, metadata removal, corrupt
images, forged MIME types, excessive size/pixels, concurrency limits, public
serialization, missing covers, and ownership-related deletion. Disposable local
API tests exercise uploads and downloads through the frontend API proxy.
