# Database Initialization

Maintainer: Saima Usman.

The Compose MySQL image creates the configured database/account on first start.
The backend authenticates, applies additive user/book field migrations, and
synchronizes Users, Books, Reviews, and Reports without resetting existing data.
Optional book covers use nullable coverData (MEDIUMTEXT) and coverVersion fields.
Existing books retain their generated covers. Deployments need permission to add
these columns; back up before the first cover-enabled backend deployment.

Sample books are inserted only when Books and Reports are both empty. This
avoids reintroducing sample content after moderation has removed all books.
Aiven databases must exist before backend startup; DB_NAME chooses the target.

Back up before schema changes. Do not replace existing volumes or mount duplicate
seed scripts. Existing MySQL credentials are not rotated by changing environment
variables. First deployment of moderation requires permission to create Reports.
