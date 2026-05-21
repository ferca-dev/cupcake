<script setup>
// Single-select dropdown. Accepts an `options` array of
// `{ value, label, disabled? }` items. Uses v-model on `modelValue`.
import { computed, useId } from 'vue';

const props = defineProps({
  id: { type: String, default: '' },
  modelValue: { type: [String, Number, Boolean, null], default: '' },
  options: {
    type: Array,
    default: () => [],
  },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'change']);

const generatedId = useId();
const selectId = computed(() => props.id || generatedId);

const describedBy = computed(() => {
  const ids = [];
  if (props.hint) ids.push(`${selectId.value}-hint`);
  if (props.error) ids.push(`${selectId.value}-error`);
  return ids.length ? ids.join(' ') : undefined;
});

const onChange = (event) => {
  emit('update:modelValue', event.target.value);
  emit('change', event.target.value);
};
</script>

<template>
  <div class="app-select" :class="{ 'app-select--invalid': error }">
    <label v-if="label" :for="selectId" class="app-select__label">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <select
      :id="selectId"
      class="app-select__control"
      :value="modelValue"
      :disabled="disabled"
      :required="required"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @change="onChange"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="option in options"
        :key="String(option.value)"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <small v-if="hint && !error" :id="`${selectId}-hint`">{{ hint }}</small>
    <small v-if="error" :id="`${selectId}-error`" class="app-select__error" role="alert">
      {{ error }}
    </small>
  </div>
</template>

<style scoped>
.app-select {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.app-select__label {
  font-weight: 500;
  font-size: var(--font-size-sm);
}

.app-select__control {
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
}

.app-select__control:focus-visible {
  outline: 0;
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.app-select--invalid .app-select__control {
  border-color: var(--color-danger-600);
}

.app-select__error {
  color: var(--color-danger-600);
}
</style>
