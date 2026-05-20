# Phase 08 - Contacts and Groups

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-07.

## Goal

Implement a tenant-safe reusable contact directory with contact groups, search/filtering, validation, and frontend management views.

## Scope

Do not implement campaign sending yet. Bulk import can be structurally prepared but does not need full XLSX/CSV parsing unless explicitly selected.

## Tasks

- Create `Contact` and `ContactGroup` Mongoose models with indexes.
- Implement tenant-safe CRUD APIs for contacts.
- Implement tenant-safe CRUD APIs for contact groups.
- Implement add/remove contacts to/from groups.
- Validate contact communication fields.
- Enforce that a contact has at least one useful channel field.
- Add filters/search for name, email, phone, WhatsApp, tags, groups, and status where practical.
- Create frontend contact service and store.
- Create `ContactListView`.
- Create contact create/edit modal or dedicated view.
- Create `ContactGroupListView`.
- Allow assigning contacts to one or more groups.
- Add tests for validation, tenant isolation, group association, and filters.
- Update API and UI documentation in English.

## API Endpoints

- `GET /api/v1/contacts`
- `POST /api/v1/contacts`
- `GET /api/v1/contacts/:id`
- `PUT /api/v1/contacts/:id`
- `DELETE /api/v1/contacts/:id`
- `POST /api/v1/contacts/import` prepared.
- `GET /api/v1/contacts/imports/:id/report` prepared.
- `GET /api/v1/contact-groups`
- `POST /api/v1/contact-groups`
- `GET /api/v1/contact-groups/:id`
- `PUT /api/v1/contact-groups/:id`
- `DELETE /api/v1/contact-groups/:id`
- `POST /api/v1/contact-groups/:id/contacts`
- `DELETE /api/v1/contact-groups/:id/contacts/:contactId`

## Infrastructure Details Not To Miss

- Contact and group queries must always be scoped by tenant.
- Deleting contacts should be soft-delete/archive unless hard delete is explicitly safe.
- Blocked and archived contacts must be excluded from future send eligibility.
- Group association must not allow cross-tenant contact IDs.
- Normalize emails and phone-like values consistently.
- Bulk import placeholders must not pretend import is complete if parsing is deferred.
- UI must show why a contact is incomplete for a specific channel when that information is available.

## Verification

- Run backend and frontend tests.
- Create contacts with email-only, phone-only, WhatsApp-only, and invalid missing-channel payloads.
- Create groups and associate contacts.
- Verify filters and search.
- Verify a client cannot access another tenant's contacts or groups.

## Definition of Done

- Clients can create, edit, archive/delete, search, and filter contacts.
- Clients can create groups and manage membership.
- Contact validation supports future channel-specific campaign sending.
