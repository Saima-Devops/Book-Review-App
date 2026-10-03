# Username Login and Password Recovery

## Existing Accounts

Login now asks only for a username and password. New users choose a unique
username during registration; email is still required for signup and recovery.
Existing accounts can use their registered full name as their username, provided
that name belongs to exactly one existing account. Accounts with duplicate names
need an administrator to assign distinct values to the new `Users.username`
column. Do not delete accounts, books, reviews or database volumes.

The backend adds nullable username and reset-token fields plus an authentication
version to existing databases at startup. This is an additive migration, not a
database reset. Back up the database before deploying changes.

## Configure Email Manually

1. Obtain SMTP credentials from an email provider you already use. Verify the
   sender address and use an app password or SMTP-specific credential, not your
   normal mailbox password. Check the provider's limits and pricing first.
2. On the EC2 host, open the protected `/opt/reading-room/.env` with your editor.
   Add the following using the provider's actual values. Keep values unquoted
   with no spaces, `$` or `#`, as required by the existing environment helper.
   `SMTP_FROM` must be a plain email address, not a display name.

   ```dotenv
   PUBLIC_URL=https://YOUR_EC2_PUBLIC_IP
   SMTP_HOST=YOUR_PROVIDER_SMTP_HOST
   SMTP_PORT=587
   SMTP_USER=YOUR_SMTP_USERNAME
   SMTP_PASSWORD=YOUR_SMTP_APP_PASSWORD
   SMTP_FROM=YOUR_VERIFIED_SENDER_EMAIL
   ```

3. Use port `587` for required STARTTLS or `465` for implicit TLS. Certificate
   verification is enabled. Do not expose an SMTP port in the EC2 security group;
   the backend needs outbound access to the provider. Production recovery
   requires a valid HTTPS certificate for `PUBLIC_URL`. Your short-lived IP
   certificate must be renewed before it expires.
4. Keep `.env` out of Git and screenshots. Run `chmod 600 .env`. The existing
   environment helper preserves these optional settings. They may also be
   supplied as runtime environment variables when running the helper.
5. After manually updating and reviewing your deployed checkout, build and
   recreate the app services without changing the database volume:

   ```bash
   cd /opt/reading-room
   docker compose up -d --build backend frontend
   docker compose ps
   ```

6. Open **Login > Forgot password**, enter a registered email address, and check
   the inbox/spam folder. Follow the emailed link, choose a new password, and log
   in with the username and new password. The previous password must fail; using
   the same link again must fail. Also run your existing verification script.

## Optional AWS Secrets Manager Storage

1. In the same AWS region as your instance, open the secret already used for
   the app. Choose **Retrieve secret value > Edit**. Preserve the existing
   database/JWT keys and add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASSWORD`, and `SMTP_FROM` as string values. Never paste credentials
   into GitHub issues, commits, screenshots or chat.
2. Ensure the existing EC2 instance role can read this specific secret via
   `secretsmanager:GetSecretValue`. If using a customer-managed KMS key, it also
   needs scoped `kms:Decrypt` permission. Do not grant wildcard access.
3. In your EC2 terminal, set `SECRET_SOURCE=aws`, `AWS_REGION=ap-south-1`,
   `SECRET_ARN` to that secret's ARN, and `PUBLIC_URL` to your HTTPS origin.
   Run `python3 scripts/configure-env.py --non-interactive` using your existing
   image tag and database-volume settings. Review nonsecret settings first;
   do not change database passwords without the documented rotation procedure.
4. Follow steps 5 and 6 above. This feature does not create AWS resources,
   retrieve credentials, send emails or deploy anything until you configure and
   execute it yourself. Secrets Manager may incur charges; it is optional.

## Security and Limits

- Reset tokens contain 256 bits of randomness; only SHA-256 hashes are stored.
- Links expire after 30 minutes and are single-use. Database row locking
  prevents concurrent requests from reusing a token.
- The link keeps the token in a URL fragment, preventing proxy request logs
  from capturing it. The recovery page removes it from the address bar.
- Successful recovery invalidates earlier JWT sessions. Passwords use bcrypt.
- Responses do not reveal whether an email is registered. Resends have a
  one-minute cooldown and per-email request limits. Reset attempts also have a
  rate limit; because the backend is behind one proxy, this limit is shared
  across that proxy's clients. Limits are in memory and reset on backend restart.
- If mail is not configured, the UI explicitly reports that recovery is
  unavailable. Delivery/storage failures are logged without secrets; the user
  receives the same generic response as an unknown account.
- Favorites remain stored per account in that browser, as before, but guests
  cannot save them. They are not synchronized between different devices.
