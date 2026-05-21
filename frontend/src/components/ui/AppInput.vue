<script setup>
// Text input with a built-in label, hint, and error slot. Two-way binds with
// `v-model`. Props:
//   - id: required so the label can target the field
//   - modelValue: bound value
//   - label/hint/error/required
//   - type/autocomplete/placeholder etc. (forwarded to <input>)
import { computed, useId } from 'vue';

const props = defineProps({
  id: { type: String, default: '' },
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  autocomplete: { type: String, default: 'off' },
  inputmode: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'blur']);

const generatedId = useId();
const inputId = computed(() => props.id || generatedId);
const describedBy = computed(() => {
  const ids = [];
  if (props.hint) ids.push(`${inputId.value}-hint`);
  if (props.error) ids.push(`${inputId.value}-error`);
  return ids.length ? ids.join(' ') : undefined;
});

const onInput = (event) => emit('update:modelValue', event.target.value);
const onBlur = (event) => emit('blur', event);
</script>

<template>
  <div class="app-input" :class="{ 'app-input--invalid': error }">
    <label v-if="label" :for="inputId" class="app-input__label">
      {{ label }}
      <span v-if="required" class="app-input__required" aria-hidden="true">*</span>
    </label>
    <input
      :id="inputId"
      class="app-input__control"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :inputmode="inputmode || undefined"
      :disabled="disabled"
      :required="required"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @blur="onBlur"
    />
    <small v-if="hint && !error" :id="`${inputId}-hint`" class="app-input__hint">{{ hint }}</small>
    <small v-if="error" :id="`${inputId}-error`" class="app-input__error" role="alert">
      {{ error }}
    </small>
  </div>
</template>

<style scoped>
.app-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.app-input__label {
  font-weight: 500;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.app-input__required {
  color: var(--color-danger-600);
  margin-left: 0.125rem;
}

.app-input__control {
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
}

.app-input__control:focus-visible {
  outline: 0;
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.app-input--invalid .app-input__control {
  border-color: var(--color-danger-600);
}

.app-input--invalid .app-input__control:focus-visible {
  box-shadow: 0 0 0 3px var(--color-danger-100);
}

.app-input__hint {
  color: var(--color-text-muted);
}

.app-input__error {
  color: var(--color-danger-600);
}
</style>
