# Phase 22 - Centered Fill-Width Layout System

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-21.

## Goal

Standardize the layout system so content is always centered within the app shell while filling available width intentionally across mobile, tablet, desktop, and large desktop screens.

## Scope

This phase is frontend layout infrastructure and QA. Do not redesign the whole product or change business workflows.

## Tasks

- Audit all layouts, views, page shells, tables, forms, dashboards, builder screens, public forms, and admin pages.
- Create or refine shared layout primitives for centered fill-width content.
- Ensure main app content uses `width: 100%`.
- Ensure content is centered inside the available shell area.
- Add sensible max-widths only where readability requires them.
- Keep data-heavy views and dashboards able to use full available width.
- Ensure public forms remain centered and readable.
- Ensure builder layout uses full-width workspace behavior.
- Ensure settings/profile forms are centered with readable line lengths.
- Remove view-specific layout hacks that conflict with shared layout primitives.
- Add responsive QA notes or tests for mobile, tablet, desktop, and large desktop.
- Update frontend layout documentation in English.

## Layout Requirements

- App shell content area fills available width.
- Page content is centered horizontally.
- Large desktop screens should not show narrow content glued to the left edge.
- Forms should not stretch to unreadable line lengths.
- Tables can fill width and scroll when needed.
- Dashboard cards should use responsive grids.
- Public form pages should remain centered in the viewport.
- Builder pages should use a full-width multi-panel layout.
- Mobile layout must remain stable.

## Infrastructure Details Not To Miss

- Prefer reusable layout classes/components over one-off CSS.
- Use CSS variables and existing theme tokens.
- Avoid viewport-width font scaling.
- Avoid fixed widths that break localization or responsive behavior.
- Check interaction between sticky top nav, collapsible sidenav, and centered content.
- Do not create horizontal page-level overflow unless a table or intentional scroll container owns it.

## Verification

- Run frontend tests.
- Inspect all major views at mobile, tablet, desktop, and large desktop widths.
- Verify content is centered and fills width appropriately.
- Verify no major page has accidental horizontal overflow.
- Verify tables still scroll inside their containers.
- Verify builder, dashboard, reports, settings, admin, and public form layouts all remain usable.

## Definition of Done

- Content is consistently centered within the app shell.
- Content uses available width intentionally.
- Large screens, small screens, public forms, dashboards, reports, and builder views are visually coherent.
- Layout behavior is documented and reusable.
