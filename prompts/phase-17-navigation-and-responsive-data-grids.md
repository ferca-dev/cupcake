# Phase 17 - Navigation and Responsive Data Grids

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-16.

## Goal

Polish the authenticated application shell and data-heavy views with a collapsible sidenav, sticky top nav, public survey open actions, large-screen responsive layouts, and robust responsive tables.

## Scope

This phase focuses on frontend UX infrastructure and data table behavior. Do not redesign the product brand or rebuild feature workflows unless required to fix layout issues.

## Tasks

- Make the sidenav collapsible in the dashboard/admin shell.
- Persist sidenav collapsed state locally.
- Keep the top nav always visible using sticky positioning.
- Ensure sticky top nav does not cover page content, modals, dropdowns, or table headers.
- Add a surveys table column/action to open the public survey in a new browser tab when a slug is available.
- Disable or explain the public open action for draft surveys without a public URL.
- Review large-screen layouts across dashboard, builder, surveys, contacts, campaigns, templates, transactions, settings, and admin.
- Improve large-screen responsiveness so content uses available width intentionally.
- Create or upgrade a reusable responsive data table component.
- Support fixed table headers during vertical scrolling.
- Support horizontal scrolling for wide tables.
- Support vertical scrolling with predictable max heights.
- Preserve keyboard accessibility and visible focus states in tables and navigation.
- Add responsive QA checks for desktop, large desktop, tablet, and mobile breakpoints.
- Add frontend tests for sidenav state, survey public-link action, and table rendering behavior where practical.
- Update frontend UI documentation in English.

## Data Table Requirements

- Header remains visible while scrolling vertically.
- Horizontal scroll works without breaking column alignment.
- Vertical scroll works inside a bounded table container.
- Table controls remain reachable on small and large screens.
- Empty, loading, and error states use the same component pattern.
- Column actions must not overflow or overlap on mobile.
- Long text must truncate or wrap intentionally.

## Large-Screen Requirements

- Avoid narrow mobile-style content stretched awkwardly across wide monitors.
- Use max-widths, grid tracks, split panes, or density adjustments where appropriate.
- Builder layout should remain usable with left palette, center canvas, and right inspector.
- Dashboard metrics should use grid layouts that scale without becoming sparse.
- Forms should keep readable line lengths on wide screens.

## Infrastructure Details Not To Miss

- Sidenav collapsed state must not break route navigation or active-route highlighting.
- Top nav sticky behavior must account for z-index with modals, dropdowns, and fixed table headers.
- Opening a public survey must use the configured frontend/public base URL and `target="_blank"` with `rel="noopener noreferrer"`.
- Do not create separate table implementations for each feature if a reusable table component can cover the shared behavior.
- Verify mobile behavior remains good after large-screen changes.
- Avoid CSS hacks with hardcoded viewport assumptions where layout primitives can solve the issue.

## Verification

- Run frontend tests.
- Open the app on mobile, tablet, desktop, and large desktop viewport sizes.
- Collapse and expand the sidenav and verify state persists after refresh.
- Scroll pages and verify the top nav remains visible.
- Open a published survey from the surveys table in a new tab.
- Verify draft surveys do not expose a broken public link.
- Test wide tables for contacts, campaigns, responses, transactions, tenants, and surveys with horizontal and vertical scrolling.
- Verify fixed table headers remain aligned with table columns.

## Definition of Done

- Dashboard/admin navigation has a collapsible sidenav and sticky top nav.
- Survey rows provide a safe public-open action when available.
- Large screens are intentionally responsive, not just mobile layouts stretched wider.
- Data tables support fixed headers plus horizontal and vertical scrolling.
- Mobile layouts continue to work.
