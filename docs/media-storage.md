# Media Storage

Cupcake stores uploaded image binaries outside MongoDB. MongoDB only stores
metadata in `media_assets`: tenant, owner, purpose, storage key, URL metadata,
size, MIME type, image dimensions, checksum, and status.

## Supported Images

Image endpoints accept only PNG, JPEG, and WebP files. Upload validation checks:

- multipart field name: `image`
- declared extension: `.png`, `.jpg`, `.jpeg`, `.webp`
- detected binary MIME type
- configured max file size (`MAX_IMAGE_UPLOAD_MB`)
- readable dimensions
- maximum dimensions of 12000 px on either side and 50 MP total

Invalid or oversized uploads return `422 VALIDATION_ERROR`.

## API

All media endpoints live under `/api/v1/media`, require a bearer token, and
require a tenant context. Tenant users automatically use their own tenant.
Super admins must pass `X-Impersonate-Tenant` because media is always
tenant-owned.

| Method | Path              | Description                                                                     |
| ------ | ----------------- | ------------------------------------------------------------------------------- |
| POST   | `/images`         | Upload one image. Multipart fields: `image`, optional `purpose`.                |
| GET    | `/images`         | List active tenant images. Query: `page`, `limit`, `purpose`, `status`, `sort`. |
| GET    | `/images/:id`     | Fetch image metadata for the caller's tenant.                                   |
| GET    | `/images/:id/url` | Return the public URL or a short-lived signed URL for the storage provider.     |
| DELETE | `/images/:id`     | Mark the asset deleted. Physical purge is deferred.                             |

Supported `purpose` values are `survey_image`, `template_image`,
`tenant_branding`, and `general`.

## Storage Drivers

`STORAGE_DRIVER=local` is for development and test only. Files are written
under `LOCAL_UPLOADS_DIR` and served by Express at the pathname from
`STORAGE_PUBLIC_BASE_URL` (default `/uploads`). The root `.gitignore` excludes
`uploads/`, and tests use `./tmp/test-uploads`.

`STORAGE_DRIVER=s3` uses an S3-compatible object store such as AWS S3,
Cloudflare R2, or DigitalOcean Spaces. Production refuses to start with the
local driver. S3 requires:

```env
S3_REGION=""
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
```

`S3_ENDPOINT` is optional for AWS S3 and required for many S3-compatible
providers. If `S3_PUBLIC_BASE_URL` is set, the API stores and returns public
CDN/object URLs. If it is empty, `/images/:id/url` returns a signed URL.

Public survey image blocks should use public/CDN URLs for stable rendering in
anonymous public forms. Private S3 buckets can still be used by authenticated
admin surfaces through the signed URL endpoint.

## Object Keys

The backend generates object keys; clients never choose them. Keys are scoped
by tenant and purpose:

```text
tenants/<tenantId>/<purpose-segment>/<yyyy>/<mm>/<uuid>.<ext>
```

This keeps tenants separated in object storage and avoids unsafe path input.

## Deletion And Cleanup

The public `DELETE` endpoint marks an asset as `deleted` and hides it from the
default list. It does not immediately remove the object from storage because
published survey versions may still reference the URL. The media service
exposes `purgeDeletedImages({ olderThan, limit })` for a future scheduled job
after retention and reference checks.

Before enabling physical purge in production, verify that published survey
versions, tenant branding, and templates no longer reference the asset URL or
`mediaAssetId`.
