# Phase 21 - Media Storage for Images

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-20.

## Goal

Implement a media storage system for images so survey images, template images, and tenant branding do not saturate MongoDB or the application server disk.

## Scope

Implement image upload, metadata, storage adapters, and integration points. Do not build a full digital asset manager.

## Tasks

- Create a `media_assets` model for metadata.
- Create a storage provider interface.
- Implement a local storage provider for development.
- Prepare an S3-compatible provider for production object storage.
- Add environment validation for storage configuration.
- Add authenticated image upload endpoints.
- Add optional public/signed URL endpoint depending on storage visibility.
- Validate file type, size, extension, and image dimensions where practical.
- Generate tenant-scoped object keys.
- Store metadata, storage key, public URL or signed URL metadata, size, mime type, dimensions, owner, and tenant.
- Integrate media selection/upload into survey image blocks and tenant branding where those features exist.
- Add cleanup strategy for orphaned assets.
- Add tests for validation, tenant ownership, local provider behavior, and metadata persistence.
- Update storage documentation in English.

## Suggested API Endpoints

- `POST /api/v1/media/images`
- `GET /api/v1/media/images`
- `GET /api/v1/media/images/:id`
- `DELETE /api/v1/media/images/:id`
- `GET /api/v1/media/images/:id/url`

## Required Environment Variables

```env
STORAGE_DRIVER="local"
STORAGE_PUBLIC_BASE_URL="http://localhost:4000/uploads"
LOCAL_UPLOADS_DIR="./uploads"
MAX_IMAGE_UPLOAD_MB=5
S3_ENDPOINT=""
S3_REGION=""
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_PUBLIC_BASE_URL=""
```

## Infrastructure Details Not To Miss

- Do not store image binaries in MongoDB.
- Do not commit uploaded files.
- Production storage must not depend on permanent local disk.
- Add upload directory to `.gitignore` for local storage.
- Use streaming uploads where practical.
- Apply auth and tenant ownership checks to media operations.
- Do not allow arbitrary file uploads through image endpoints.
- Normalize images or reject unsupported image formats.
- Consider thumbnail generation only if the UI needs it.
- Deleting a media asset should not break existing published survey versions without a clear policy.

## Verification

- Run backend and frontend tests.
- Upload valid PNG/JPEG/WebP images.
- Reject oversized files and invalid file types.
- Attach an uploaded image to an image block and render it in the builder and public form.
- Verify another tenant cannot access the media record.
- Verify local uploads are ignored by Git.
- Verify storage provider env validation.

## Definition of Done

- Images are stored through a provider abstraction, not in MongoDB.
- Local development upload works.
- Production object storage is ready through configuration.
- Survey image blocks and branding can reference stored media safely.
