<script setup>
// Manages the top-level `logicRules` array on the form schema. The
// inspector renders this when the user is editing form-level settings (no
// field selected). For per-field visibility shortcuts, see the visibility
// section embedded inside `BuilderInspector`.
import { computed } from 'vue';

import { useI18n } from '../../i18n/index.js';
import { AppButton, AppInput, AppSelect } from '../ui/index.js';
import ConditionBuilder from './ConditionBuilder.vue';
import {
  SUPPORTED_LOGIC_RULE_TYPES,
  SUPPORTED_VISIBILITY_ACTIONS,
  SUPPORTED_NAVIGATION_ACTIONS,
} from '../../features/builder/builder.schema.js';
import { PRESENTATION_FIELD_TYPES } from '../../features/builder/builder.constants.js';

const props = defineProps({
  rules: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
  sections: { type: Array, default: () => [] },
  issues: { type: Array, default: () => [] },
});

const emit = defineEmits(['add', 'update', 'remove']);

const { t } = useI18n();

const sourceFields = computed(() =>
  props.fields.filter(
    (field) =>
      field?.id && !PRESENTATION_FIELD_TYPES.has(field.type) && field.type !== 'file_upload',
  ),
);

const fieldOptions = computed(() =>
  sourceFields.value.map((field) => ({
    value: field.id,
    label: field.label || field.key || field.id,
  })),
);

const sectionOptions = computed(() =>
  props.sections.map((section) => ({
    value: section.id,
    label: section.title || section.id,
  })),
);

const typeOptions = SUPPORTED_LOGIC_RULE_TYPES.map((type) => ({
  value: type,
  label: t(`builder.logic.ruleType.${type}`),
}));

const actionOptionsFor = (type) => {
  if (type === 'visibility') {
    return SUPPORTED_VISIBILITY_ACTIONS.map((value) => ({
      value,
      label: t(`builder.logic.action.${value}`),
    }));
  }
  if (type === 'navigation') {
    return SUPPORTED_NAVIGATION_ACTIONS.map((value) => ({
      value,
      label: t(`builder.logic.action.${value}`),
    }));
  }
  return [{ value: 'end_survey', label: t('builder.logic.action.end_survey') }];
};

const issuesForRule = (index) =>
  props.issues.filter((issue) => issue.path?.[0] === 'logicRules' && issue.path?.[1] === index);

const issueText = (ruleIndex, path) =>
  issuesForRule(ruleIndex)
    .filter((issue) => path.every((seg, i) => issue.path?.[i + 2] === seg))
    .map((issue) => issue.message)
    .join(' ');

const conditionsIssuesForRule = (ruleIndex) =>
  issuesForRule(ruleIndex)
    .filter((issue) => issue.path?.[2] === 'conditions')
    .map((issue) => ({ ...issue, path: issue.path.slice(3) }));

const updateRule = (ruleId, patch) => emit('update', { ruleId, patch });

const DEFAULT_ACTION_BY_TYPE = {
  visibility: { type: 'show', target: null },
  navigation: { type: 'jump_to_field', target: null },
  end: { type: 'end_survey', target: null },
};

const onTypeChange = (rule, nextType) => {
  updateRule(rule.id, {
    type: nextType,
    action: DEFAULT_ACTION_BY_TYPE[nextType] ?? DEFAULT_ACTION_BY_TYPE.visibility,
    targetFieldId: nextType === 'visibility' ? (rule.targetFieldId ?? null) : null,
    targetSectionId: nextType === 'navigation' ? (rule.targetSectionId ?? null) : null,
  });
};

const onActionTypeChange = (rule, nextActionType) => {
  updateRule(rule.id, { action: { ...rule.action, type: nextActionType, target: null } });
};

const onActionTargetChange = (rule, target) => {
  updateRule(rule.id, { action: { ...rule.action, target } });
};
</script>

<template>
  <section class="logic-rule-editor" :aria-label="t('builder.logic.title')">
    <header class="logic-rule-editor__header">
      <h4>{{ t('builder.logic.title') }}</h4>
      <AppButton
        variant="secondary"
        size="sm"
        :disabled="sourceFields.length === 0"
        @click="$emit('add')"
      >
        + {{ t('builder.logic.addRule') }}
      </AppButton>
    </header>

    <p v-if="rules.length === 0" class="logic-rule-editor__empty">
      {{ t('builder.logic.empty') }}
    </p>

    <ol v-else class="logic-rule-editor__list">
      <li v-for="(rule, ruleIndex) in rules" :key="rule.id" class="logic-rule-editor__rule">
        <header class="logic-rule-editor__rule-header">
          <AppInput
            :model-value="rule.name"
            :label="t('builder.logic.rule.name')"
            :placeholder="t('builder.logic.rule.namePlaceholder')"
            @update:model-value="(value) => updateRule(rule.id, { name: value })"
          />
          <AppSelect
            :model-value="rule.type"
            :options="typeOptions"
            :label="t('builder.logic.rule.type')"
            @update:model-value="(value) => onTypeChange(rule, value)"
          />
          <AppButton
            variant="ghost"
            size="sm"
            :title="t('builder.logic.rule.remove')"
            @click="$emit('remove', rule.id)"
          >
            ✕
          </AppButton>
        </header>

        <div class="logic-rule-editor__when">
          <span class="logic-rule-editor__label">{{ t('builder.logic.rule.whenLabel') }}</span>
          <ConditionBuilder
            :conditions="rule.conditions"
            :condition-mode="rule.conditionMode"
            :source-fields="sourceFields"
            :issues="conditionsIssuesForRule(ruleIndex)"
            @update:conditions="(value) => updateRule(rule.id, { conditions: value })"
            @update:condition-mode="(value) => updateRule(rule.id, { conditionMode: value })"
          />
        </div>

        <div class="logic-rule-editor__then">
          <span class="logic-rule-editor__label">{{ t('builder.logic.rule.thenLabel') }}</span>

          <template v-if="rule.type === 'visibility'">
            <AppSelect
              :model-value="rule.action.type"
              :options="actionOptionsFor('visibility')"
              :label="t('builder.logic.rule.action')"
              :error="issueText(ruleIndex, ['action', 'type'])"
              @update:model-value="(value) => onActionTypeChange(rule, value)"
            />
            <AppSelect
              :model-value="rule.targetFieldId ?? ''"
              :options="fieldOptions"
              :label="t('builder.logic.rule.targetField')"
              :error="issueText(ruleIndex, ['targetFieldId'])"
              @update:model-value="(value) => updateRule(rule.id, { targetFieldId: value })"
            />
          </template>

          <template v-else-if="rule.type === 'navigation'">
            <AppSelect
              :model-value="rule.action.type"
              :options="actionOptionsFor('navigation')"
              :label="t('builder.logic.rule.action')"
              :error="issueText(ruleIndex, ['action', 'type'])"
              @update:model-value="(value) => onActionTypeChange(rule, value)"
            />
            <AppSelect
              v-if="rule.action.type === 'jump_to_field'"
              :model-value="rule.action.target ?? ''"
              :options="fieldOptions"
              :label="t('builder.logic.rule.jumpTarget')"
              :error="issueText(ruleIndex, ['action', 'target'])"
              @update:model-value="(value) => onActionTargetChange(rule, value)"
            />
            <AppSelect
              v-else-if="rule.action.type === 'jump_to_section'"
              :model-value="rule.action.target ?? ''"
              :options="sectionOptions"
              :label="t('builder.logic.rule.jumpTarget')"
              :error="issueText(ruleIndex, ['action', 'target'])"
              @update:model-value="(value) => onActionTargetChange(rule, value)"
            />
            <AppInput
              v-else
              type="number"
              :model-value="rule.action.target ?? ''"
              :label="t('builder.logic.rule.jumpPage')"
              :error="issueText(ruleIndex, ['action', 'target'])"
              @update:model-value="(value) => onActionTargetChange(rule, value)"
            />
          </template>

          <template v-else>
            <span class="logic-rule-editor__plain">{{ t('builder.logic.action.end_survey') }}</span>
          </template>
        </div>
      </li>
    </ol>

    <small v-if="sourceFields.length === 0" class="logic-rule-editor__hint">
      {{ t('builder.logic.noFieldsHint') }}
    </small>
  </section>
</template>

<style scoped>
.logic-rule-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
}

.logic-rule-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logic-rule-editor__header h4 {
  margin: 0;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.logic-rule-editor__empty,
.logic-rule-editor__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.logic-rule-editor__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.logic-rule-editor__rule {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.logic-rule-editor__rule-header {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--space-2);
  align-items: end;
}

.logic-rule-editor__when,
.logic-rule-editor__then {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.logic-rule-editor__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.logic-rule-editor__plain {
  font-size: var(--font-size-sm);
}
</style>
