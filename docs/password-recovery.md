# Password Recovery

Maintainer: Saima Usman.

Email recovery is implemented but requires operator-configured SMTP delivery.
Without configuration, the form reports that recovery is unavailable. Every
user receives messages at their own registered address; SMTP credentials belong
to the application's sender account, not the recipient.

## Account Login

Signup requires email and username. Login uses username/password. Legacy accounts
may use a unique registered full name when username is absent. Duplicate legacy
names require administrator assignment of distinct usernames.

## Backend Configuration

Supply runtime settings or protected secrets on the backend only:

```dotenv
PUBLIC_URL=https://FRONTEND-PUBLIC-HOSTNAME
SMTP_HOST=SMTP-PROVIDER-HOSTNAME
SMTP_PORT=587
SMTP_USER=SENDER-ACCOUNT
SMTP_PASSWORD=SMTP-APP-PASSWORD
SMTP_FROM=VERIFIED-SENDER-EMAIL
```

PUBLIC_URL is the frontend origin, not the backend address. Port 587 requires
STARTTLS; 465 uses implicit TLS. Server certificate verification remains enabled.
Use provider-approved SMTP credentials or an app password, not a normal mailbox
password. Verify the sender and check sending limits, costs, and cloud egress rules.

Northflank: configure backend runtime settings/secrets and redeploy.
Compose: set optional values in the protected root .env and recreate the backend.
Secrets Manager deployments can include SMTP fields in the existing JSON secret;
retrieval uses the configured EC2 role. None of these settings belong in the frontend.

Gmail may be used for a small deployment when the account supports app passwords.
It requires 2-Step Verification and an app password; account policies can prevent
availability. Host smtp.gmail.com, port 587, with matching sender/user address.
[Google app passwords](https://support.google.com/mail/answer/185833)
and [SMTP settings](https://support.google.com/mail/answer/7104828).

## Verification

1. Request a reset for a registered address and confirm inbox/spam delivery.
2. Confirm the link opens the intended frontend HTTPS origin.
3. Set a new password and log in with the existing username.
4. Verify the previous password, consumed link, and prior sessions no longer work.
5. Check unknown-email requests return the same generic acknowledgement.

A generic acknowledgement alone does not prove delivery: delivery failures are
intentionally not exposed as account-existence information. Check provider/log
results without displaying reset tokens.

## Security Properties and Limits

Tokens contain 256 bits of randomness; only SHA-256 hashes are stored. Links
expire after 30 minutes and are single-use. Row locking prevents concurrent
reuse. Passwords are bcrypt-hashed; successful reset increments the session
version to invalidate earlier JWTs.

The token is placed in a URL fragment, not the server request query, and the
reset page clears it from the address bar. Treat the full link as a secret.

The backend uses resend cooldowns and in-memory rate limits. Behind a shared
proxy, some limits are shared across clients; restarts reset counters.
Multi-replica deployment requires a shared limiter. Public sender delivery and
email-address verification are separate concerns; signup does not currently
verify email ownership.

Changing the frontend domain requires updating PUBLIC_URL and verifying reset
emails again. Custom-domain configuration is optional and not automatic.
