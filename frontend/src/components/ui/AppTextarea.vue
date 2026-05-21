<script setup>
// Multi-line text input. Shares the visual language of AppInput. Props mirror
// AppInput plus `rows` and `maxlength`.
import { computed, useId } from 'vue';

const props = defineProps({
  id: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  rows: { type: Number, default: 4 },
  maxlength: { type: Number, default: 0 },
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
  <div class="app-textarea" :class="{ 'app-textarea--invalid': error }">
    <label v-if="label" :for="inputId" class="app-textarea__label">
      {{ label }}
      <span v-if="required" class="app-textarea__required" aria-hidden="true">*</span>
    </label>
    <textarea
      :id="inputId"
      class="app-textarea__control"
      :rows="rows"
      :maxlength="maxlength || undefined"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @blur="onBlur"
    />
    <small v-if="hint && !error" :id="`${inputId}-hint`">{{ hint }}</small>
    <small v-if="error" :id="`${inputId}-error`" class="app-textarea__error" role="alert">{{
      error
    }}</small>
  </div>
</template>

<style scoped>
.app-textarea {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.app-textarea__label {
  font-weight: 500;
  font-size: var(--font-size-sm);
}

.app-textarea__required {
  color: var(--color-danger-600);
}

.app-textarea__control {
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  resize: vertical;
  min-height: 6rem;
}

.app-textarea__control:focus-visible {
  outline: 0;
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.app-textarea--invalid .app-textarea__control {
  border-color: var(--color-danger-600);
}

.app-textarea__error {
  color: var(--color-danger-600);
}
</style>
