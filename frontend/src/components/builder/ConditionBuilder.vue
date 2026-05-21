<script setup>
// Edits a list of conditions used by either a field's visibility shortcut
// or a top-level logic rule. The component is fully controlled: it accepts
// `conditions` and emits an updated array on every change. The parent owns
// persistence (store mutation, save-on-blur, etc.).
//
// Conditions reference fields by id, so the parent passes the available
// source fields. Self-references and presentation/file-upload fields are
// filtered out at the parent level — this component trusts the supplied
// list.
import { computed } from 'vue';

import { useI18n } from '../../i18n/index.js';
import { AppButton, AppInput, AppSelect } from '../ui/index.js';
import {
  operatorsForFieldType,
  SUPPORTED_CONDITION_MODES,
} from '../../features/builder/builder.schema.js';

const props = defineProps({
  conditions: { type: Array, default: () => [] },
  conditionMode: { type: String, default: 'all' },
  sourceFields: { type: Array, default: () => [] },
  issues: { type: Array, default: () => [] },
  // Hide the mode (all/any) toggle when there's only ever one condition.
  showModeToggle: { type: Boolean, default: true },
});

const emit = defineEmits(['update:conditions', 'update:condition-mode']);

const { t } = useI18n();

const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

const sourceById = computed(() => {
  const map = new Map();
  for (const field of props.sourceFields) {
    if (field?.id) map.set(field.id, field);
  }
  return map;
});

const sourceOptions = computed(() =>
  props.sourceFields.map((field) => ({
    value: field.id,
    label: field.label || field.key || field.id,
  })),
);

const modeOptions = computed(() =>
  SUPPORTED_CONDITION_MODES.map((mode) => ({
    value: mode,
    label: t(`builder.logic.conditionMode.${mode}`),
  })),
);

const operatorsFor = (fieldId) => {
  const source = sourceById.value.get(fieldId);
  if (!source) return [];
  return operatorsForFieldType(source.type).map((op) => ({
    value: op,
    label: t(`builder.logic.operators.${op}`),
  }));
};

const valueOptionsFor = (fieldId) => {
  const source = sourceById.value.get(fieldId);
  if (!source) return null;
  if (source.type === 'select' || source.type === 'radio_group' || source.type === 'checkbox_group') {
    return (source.options ?? []).map((opt) => ({
      value: opt.key,
      label: opt.label || opt.key,
    }));
  }
  if (source.type === 'yes_no' || source.type === 'checkbox') {
    return [
      { value: 'true', label: t('publicForm.yes') },
      { value: 'false', label: t('publicForm.no') },
    ];
  }
  return null;
};

const inputTypeFor = (fieldId) => {
  const source = sourceById.value.get(fieldId);
  if (!source) return 'text';
  if (source.type === 'number' || source.type === 'rating' || source.type === 'nps') return 'number';
  if (source.type === 'date') return 'date';
  if (source.type === 'time') return 'time';
  return 'text';
};

const issueAt = (idx, segment) =>
  props.issues
    .filter((issue) => issue.path?.[issue.path.length - 2] === idx && issue.path?.[issue.path.length - 1] === segment)
    .map((issue) => issue.message)
    .join(' ');

const emitConditions = (next) => emit('update:conditions', next);

const updateCondition = (index, patch) => {
  const next = props.conditions.slice();
  const current = next[index] ?? {};
  const merged = { ...current, ...patch };
  // Switching the source field resets the operator/value because the legal
  // operators depend on the new field's type.
  if (patch.fieldId && patch.fieldId !== current.fieldId) {
    merged.operator = 'equals';
    merged.value = '';
  }
  // Operators that don't consume a value should clear it out.
  if ('operator' in patch && NO_VALUE_OPERATORS.has(patch.operator)) {
    merged.value = undefined;
  }
  next[index] = merged;
  emitConditions(next);
};

const removeCondition = (index) => {
  const next = props.conditions.slice();
  next.splice(index, 1);
  emitConditions(next);
};

const addCondition = () => {
  const firstField = props.sourceFields[0];
  if (!firstField) return;
  emitConditions([
    ...props.conditions,
    { fieldId: firstField.id, operator: 'equals', value: '' },
  ]);
};

const changeMode = (mode) => emit('update:condition-mode', mode);
</script>

<template>
  <div class="condition-builder">
    <header v-if="conditions.length > 1 && showModeToggle" class="condition-builder__mode">
      <span class="condition-builder__mode-label">{{ t('builder.logic.conditionMode.label') }}</span>
      <AppSelect
        :model-value="conditionMode"
        :options="modeOptions"
        @update:model-value="changeMode"
      />
    </header>

    <ol v-if="conditions.length > 0" class="condition-builder__list">
      <li v-for="(cond, idx) in conditions" :key="idx" class="condition-builder__row">
        <div class="condition-builder__cell">
          <AppSelect
            :model-value="cond.fieldId"
            :options="sourceOptions"
            :label="t('builder.logic.condition.field')"
            :error="issueAt(idx, 'fieldId')"
            @update:model-value="(value) => updateCondition(idx, { fieldId: value })"
          />
        </div>
        <div class="condition-builder__cell">
          <AppSelect
            :model-value="cond.operator"
            :options="operatorsFor(cond.fieldId)"
            :label="t('builder.logic.condition.operator')"
            :error="issueAt(idx, 'operator')"
            @update:model-value="(value) => updateCondition(idx, { operator: value })"
          />
        </div>
        <div v-if="!NO_VALUE_OPERATORS.has(cond.operator)" class="condition-builder__cell">
          <AppSelect
            v-if="valueOptionsFor(cond.fieldId)"
            :model-value="cond.value ?? ''"
            :options="valueOptionsFor(cond.fieldId)"
            :label="t('builder.logic.condition.value')"
            :error="issueAt(idx, 'value')"
            @update:model-value="(value) => updateCondition(idx, { value })"
          />
          <AppInput
            v-else
            :model-value="cond.value ?? ''"
            :type="inputTypeFor(cond.fieldId)"
            :label="t('builder.logic.condition.value')"
            :error="issueAt(idx, 'value')"
            @update:model-value="(value) => updateCondition(idx, { value })"
          />
        </div>
        <div class="condition-builder__cell condition-builder__cell--remove">
          <AppButton variant="ghost" size="sm" @click="removeCondition(idx)">
            {{ t('builder.logic.condition.remove') }}
          </AppButton>
        </div>
      </li>
    </ol>

    <AppButton variant="secondary" size="sm" :disabled="sourceFields.length === 0" @click="addCondition">
      + {{ t('builder.logic.condition.add') }}
    </AppButton>
    <small v-if="sourceFields.length === 0" class="condition-builder__hint">
      {{ t('builder.logic.condition.noSources') }}
    </small>
  </div>
</template>

<style scoped>
.condition-builder {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.condition-builder__mode {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.condition-builder__mode-label {
  white-space: nowrap;
}

.condition-builder__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.condition-builder__row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: var(--space-2);
  align-items: end;
  padding: var(--space-2);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.condition-builder__cell {
  min-width: 0;
}

.condition-builder__cell--remove {
  align-self: end;
}

.condition-builder__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

@media (max-width: 720px) {
  .condition-builder__row {
    grid-template-columns: 1fr;
  }
}
</style>
