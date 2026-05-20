# Phase 07 - Conditional Logic Engine

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-06.

## Goal

Implement conditional logic across backend validation, builder editing, preview rendering, and public form rendering.

## Scope

Support visibility rules first. Add navigation jumps and early endings if the current schema/layout supports them cleanly.

## Tasks

- Create a shared conditional logic model in the form schema.
- Implement backend `logicEngine.service.js`.
- Validate conditional rules during survey schema validation.
- Apply conditional visibility during response validation.
- Ensure hidden required fields do not block submission.
- Implement frontend logic evaluation utilities.
- Create `ConditionBuilder`.
- Create `LogicRuleEditor`.
- Allow creating, editing, and deleting visibility rules.
- Add support for compound conditions with `all` and `any`.
- Evaluate rules in builder preview.
- Evaluate rules in public form rendering.
- Add navigation jump support for multi-step/page-break flow if applicable.
- Add early ending support if applicable.
- Add tests for operators, compound conditions, hidden required fields, and invalid rule references.
- Update schema documentation in English.

## Rule Shape

```js
{
  id: 'rule_123',
  name: 'Show comments when satisfaction is low',
  type: 'visibility',
  targetFieldId: 'field_comments',
  conditions: [
    {
      fieldId: 'field_satisfaction',
      operator: 'equals',
      value: 'low'
    }
  ],
  conditionMode: 'all',
  action: {
    type: 'show'
  }
}
```

## Infrastructure Details Not To Miss

- Rules must not reference deleted fields.
- Operators must validate compatible field types where practical.
- Logic evaluation must be deterministic between frontend and backend.
- Keep backend validation authoritative.
- Do not allow a malicious client to bypass required fields by omitting visible fields.
- Protect against circular or impossible navigation rules.
- Store logic rules in the survey schema and published version schema.
- Ensure old published versions keep their original logic behavior.

## Verification

- Run backend and frontend tests.
- Create a form with a required field hidden by a condition.
- Submit answers where the hidden field is not required.
- Submit answers where the field is visible and required.
- Verify preview and public form behavior match.
- Verify deleting a field invalidates or removes related rules safely.

## Definition of Done

- Users can configure show/hide logic.
- Builder preview and public form evaluate logic consistently.
- Backend validation respects visibility.
- Conditional rules are persisted in the schema and versioned on publish.
