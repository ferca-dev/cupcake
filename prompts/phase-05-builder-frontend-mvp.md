# Phase 05 - Builder Frontend MVP

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-04.

## Goal

Build a functional visual survey builder MVP that can create and edit a valid draft schema and persist it through the surveys API.

## Scope

Frontend builder only. Advanced conditional logic UI is Phase 07.

## Tasks

- Create `SurveyBuilderView`.
- Create `builder.store.js`.
- Create builder services integrated with the surveys API.
- Create `BuilderSidebar` for available field types.
- Create `BuilderCanvas` for the draft form preview.
- Create `BuilderInspector` for selected field properties.
- Create `BuilderFieldRenderer` and `BuilderFieldWrapper`.
- Implement field components for core field types.
- Allow adding, selecting, removing, duplicating, and reordering fields.
- Allow editing label, placeholder, help text, required, default value, key, and width/layout where applicable.
- Allow managing options for select, radio, and checkbox groups.
- Add client-side schema validation before saving.
- Persist draft changes through the backend.
- Add unsaved-change handling.
- Add tests for builder store actions and schema validation.
- Update frontend documentation in English.

## Minimum Builder State

```js
{
  surveyId: null,
  selectedFieldId: null,
  schema: {
    fields: [],
    sections: [],
    logicRules: [],
    layout: {
      mode: 'single_page',
      showProgress: true
    }
  },
  isDirty: false,
  previewMode: 'desktop'
}
```

## Required Actions

- `addField(type)`
- `removeField(fieldId)`
- `duplicateField(fieldId)`
- `selectField(fieldId)`
- `updateField(fieldId, payload)`
- `reorderFields(sourceIndex, targetIndex)`
- `addOption(fieldId)`
- `updateOption(fieldId, optionId, payload)`
- `removeOption(fieldId, optionId)`
- `validateSchema()`
- `saveDraft()`
- `publishSurvey()`

## Infrastructure Details Not To Miss

- Use a Vue 3-compatible drag-and-drop library or a clean internal implementation.
- Keep drag/drop state separate from persisted schema state where possible.
- Generate stable field IDs and keys.
- Avoid saving invalid schemas.
- Do not let editing UI mutate store state in uncontrolled ways.
- Builder UI must be responsive enough to use on desktop and not break on smaller screens.
- Keep user-facing labels in i18n-ready files.
- Publish must call the backend publish endpoint, not fake local state.

## Verification

- Run frontend tests.
- Start backend and frontend.
- Create a survey draft.
- Add fields of multiple types.
- Edit field properties.
- Reorder fields.
- Save and reload the builder; verify schema persists.
- Publish from the builder and verify backend status/version.

## Definition of Done

- A user can visually create a form schema.
- A user can save a draft to the backend.
- Saved schemas are valid according to backend validation.
- The builder has a usable left palette, center canvas, and right inspector.
