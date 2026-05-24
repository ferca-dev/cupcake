# Custom branding and domains

Phase 33 adds tenant-owned branding for public forms and verified custom
domains for public form routing.

## Branding model

Tenant branding is stored on `Tenant.settings.branding`:

```js
{
  logoUrl: string | null,
  logoMediaAssetId: ObjectId | null,
  faviconUrl: string | null,
  faviconMediaAssetId: ObjectId | null,
  primaryColor: string | null,
  accentColor: string | null,
  backgroundColor: string | null,
  textColor: string | null,
  publicFormTheme: 'light' | 'dark' | 'system',
  whiteLabel: boolean
}
```

The public form renderer receives the effective branding in the public form
payload. If the tenant plan does not include `surveys.customBranding`, the API
returns default platform branding. If the plan does not include
`surveys.whiteLabel`, `whiteLabel` is forced to `false`.

Logo and favicon assets should be uploaded through the media API with
`purpose=tenant_branding`. The branding API validates tenant ownership before a
media asset id can be attached.

## Plan gates

| Feature key | Purpose |
| --- | --- |
| `surveys.customBranding` | Enables updating tenant branding and applying it to public forms. |
| `surveys.whiteLabel` | Allows hiding platform branding on public forms and campaign email templates. |
| `surveys.customDomains` | Allows requesting, verifying, activating, and routing custom domains. |

## Tenant API

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/branding` | Returns effective branding and capability flags. |
| `PUT` | `/api/v1/branding` | Updates branding. Requires `surveys.customBranding`; white-label requires `surveys.whiteLabel`. |
| `GET` | `/api/v1/domains` | Lists tenant domains. |
| `POST` | `/api/v1/domains` | Requests a hostname and returns the DNS TXT record to create. |
| `POST` | `/api/v1/domains/:id/verify` | Performs DNS TXT verification. |
| `PATCH` | `/api/v1/domains/:id/status` | Activates or deactivates a verified domain. |
| `DELETE` | `/api/v1/domains/:id` | Soft deletes and deactivates the domain. |

## Admin API

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/admin/domains` | Lists domains across tenants. Supports status, tenant, and search filters. |
| `POST` | `/api/v1/admin/domains/:id/verify` | Operator override for verification, optionally activating the domain. |
| `PATCH` | `/api/v1/admin/domains/:id/status` | Operator status override. Activation still requires prior verification. |

## DNS verification

When a tenant requests `forms.example.com`, the API returns:

```txt
TXT _cupcake-verification.forms.example.com "cupcake-domain-verification=<token>"
```

The tenant must create that TXT record before calling
`POST /api/v1/domains/:id/verify`. Activation is blocked until the DNS proof has
been observed. Hostnames are normalized and rejected when they are IP addresses,
reserved/internal names, localhost names, malformed labels, or include protocol,
path, credentials, or port.

## SSL and routing

`sslMode` is explicit on every domain:

- `platform_managed`: the platform is expected to provision and renew TLS.
- `manual`: operators manage the certificate outside the app.
- `external`: TLS terminates at an external proxy/CDN before reaching the app.

The app only routes public forms. It does not host tenant websites. Public form
requests inspect the `Host` header. If it matches an active custom domain, the
survey lookup is restricted to that domain tenant. A slug from another tenant
returns `404`, which prevents cross-tenant leaks even when a hostname is valid.

## Email branding

Campaign email templates use the tenant branding payload when available:

- `logoUrl` is rendered above the invitation body.
- `primaryColor` styles the call-to-action button.
- `whiteLabel` removes the platform footer when the plan allows it.

SMS and WhatsApp messages remain text-only and only use the public URL.
