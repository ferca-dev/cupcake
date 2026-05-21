<script setup>
// Renders a single field of a published form as an interactive control.
// Pure presentation — state lives in the parent form view, which passes the
// current value and listens for `update:modelValue`. The wrapper handles the
// label, required indicator, help text, and error message; the inner
// template just provides the type-specific control.
import { computed, useId } from 'vue';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: {
    type: [String, Number, Boolean, Array, Object],
    default: null,
  },
  error: { type: String, default: '' },
});

defineEmits(['update:modelValue']);

const generatedId = useId();
const fieldId = computed(() => `public-field-${props.field.id || generatedId}`);

const isPresentational = computed(() =>
  ['image_block', 'text_block', 'divider', 'section_title', 'page_break'].includes(
    props.field.type,
  ),
);

const isHidden = computed(() => props.field.type === 'hidden');

const ratingValues = computed(() => {
  const min = props.field.validation?.min ?? 1;
  const max = props.field.validation?.max ?? 5;
  const safeMin = Math.max(0, Math.min(min, max));
  const safeMax = Math.max(safeMin, max);
  return Array.from({ length: safeMax - safeMin + 1 }, (_, i) => safeMin + i);
});

const npsValues = Array.from({ length: 11 }, (_, i) => i);

const errorId = computed(() => `${fieldId.value}-error`);
const describedBy = computed(() => {
  const ids = [];
  if (props.field.helpText) ids.push(`${fieldId.value}-hint`);
  if (props.error) ids.push(errorId.value);
  return ids.length ? ids.join(' ') : undefined;
});

const onTextInput = (event, emit) => emit('update:modelValue', event.target.value);
const onNumberInput = (event, emit) => {
  const raw = event.target.value;
  if (raw === '') emit('update:modelValue', '');
  else emit('update:modelValue', raw);
};
const onCheckboxGroupChange = (optionKey, checked, emit) => {
  const current = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
  const index = current.indexOf(optionKey);
  if (checked && index < 0) current.push(optionKey);
  if (!checked && index >= 0) current.splice(index, 1);
  emit('update:modelValue', current);
};
</script>

<template>
  <div v-if="isHidden" class="public-field public-field--hidden" />

  <section
    v-else-if="isPresentational"
    class="public-field public-field--presentational"
    :data-field-type="field.type"
  >
    <h2 v-if="field.type === 'section_title'" class="public-field__section-title">
      {{ field.label || '' }}
    </h2>
    <p v-else-if="field.type === 'text_block'" class="public-field__text">
      {{ field.label || '' }}
    </p>
    <img
      v-else-if="field.type === 'image_block' && field.settings?.imageUrl"
      :src="field.settings.imageUrl"
      class="public-field__image"
      :alt="field.label || ''"
    />
    <hr v-else-if="field.type === 'divider'" class="public-field__divider" />
    <div v-else-if="field.type === 'page_break'" class="public-field__page-break" />
  </section>

  <div
    v-else
    class="public-field"
    :class="{ 'public-field--invalid': error }"
    :data-field-id="field.id"
    :data-field-type="field.type"
  >
    <label
      v-if="field.type !== 'checkbox'"
      :for="fieldId"
      class="public-field__label"
    >
      {{ field.label || '' }}
      <span v-if="field.required" class="public-field__required" aria-hidden="true">*</span>
    </label>

    <small v-if="field.helpText" :id="`${fieldId}-hint`" class="public-field__hint">
      {{ field.helpText }}
    </small>

    <div class="public-field__control">
      <input
        v-if="field.type === 'short_text'"
        :id="fieldId"
        type="text"
        class="public-field__input"
        :value="modelValue"
        :placeholder="field.placeholder || ''"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="(event) => onTextInput(event, $emit)"
      />

      <textarea
        v-else-if="field.type === 'long_text'"
        :id="fieldId"
        class="public-field__textarea"
        rows="4"
        :value="modelValue"
        :placeholder="field.placeholder || ''"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="(event) => onTextInput(event, $emit)"
      />

      <input
        v-else-if="field.type === 'email'"
        :id="fieldId"
        type="email"
        autocomplete="email"
        inputmode="email"
        class="public-field__input"
        :value="modelValue"
        :placeholder="field.placeholder || ''"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="(event) => onTextInput(event, $emit)"
      />

      <input
        v-else-if="field.type === 'phone'"
        :id="fieldId"
        type="tel"
        autocomplete="tel"
        inputmode="tel"
        class="public-field__input"
        :value="modelValue"
        :placeholder="field.placeholder || ''"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="(event) => onTextInput(event, $emit)"
      />

      <input
        v-else-if="field.type === 'number'"
        :id="fieldId"
        type="number"
        inputmode="decimal"
        class="public-field__input"
        :value="modelValue"
        :placeholder="field.placeholder || ''"
        :min="field.validation?.min ?? undefined"
        :max="field.validation?.max ?? undefined"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="(event) => onNumberInput(event, $emit)"
      />

      <input
        v-else-if="field.type === 'date'"
        :id="fieldId"
        type="date"
        class="public-field__input"
        :value="modelValue"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="(event) => onTextInput(event, $emit)"
      />

      <input
        v-else-if="field.type === 'time'"
        :id="fieldId"
        type="time"
        class="public-field__input"
        :value="modelValue"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="(event) => onTextInput(event, $emit)"
      />

      <select
        v-else-if="field.type === 'select'"
        :id="fieldId"
        class="public-field__input"
        :value="modelValue"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @change="(event) => onTextInput(event, $emit)"
      >
        <option value="" disabled>
          {{ field.placeholder || $slots['select-placeholder'] || 'Select an option' }}
        </option>
        <option v-for="opt in field.options ?? []" :key="opt.key" :value="opt.key">
          {{ opt.label }}
        </option>
      </select>

      <div v-else-if="field.type === 'radio_group'" class="public-field__options" role="radiogroup">
        <label v-for="opt in field.options ?? []" :key="opt.key" class="public-field__option">
          <input
            type="radio"
            :name="fieldId"
            :value="opt.key"
            :checked="modelValue === opt.key"
            @change="$emit('update:modelValue', opt.key)"
          />
          <span>{{ opt.label }}</span>
        </label>
      </div>

      <div v-else-if="field.type === 'checkbox_group'" class="public-field__options" role="group">
        <label v-for="opt in field.options ?? []" :key="opt.key" class="public-field__option">
          <input
            type="checkbox"
            :value="opt.key"
            :checked="Array.isArray(modelValue) && modelValue.includes(opt.key)"
            @change="(event) => onCheckboxGroupChange(opt.key, event.target.checked, $emit)"
          />
          <span>{{ opt.label }}</span>
        </label>
      </div>

      <label
        v-else-if="field.type === 'checkbox'"
        :for="fieldId"
        class="public-field__option public-field__option--inline"
      >
        <input
          :id="fieldId"
          type="checkbox"
          :checked="modelValue === true"
          :required="field.required"
          @change="$emit('update:modelValue', $event.target.checked)"
        />
        <span>
          {{ field.label || '' }}
          <span v-if="field.required" class="public-field__required" aria-hidden="true">*</span>
        </span>
      </label>

      <div v-else-if="field.type === 'yes_no'" class="public-field__yesno">
        <button
          type="button"
          :class="['public-field__yesno-button', { 'is-active': modelValue === true }]"
          @click="$emit('update:modelValue', true)"
        >
          <slot name="yes">Yes</slot>
        </button>
        <button
          type="button"
          :class="['public-field__yesno-button', { 'is-active': modelValue === false }]"
          @click="$emit('update:modelValue', false)"
        >
          <slot name="no">No</slot>
        </button>
      </div>

      <div v-else-if="field.type === 'rating'" class="public-field__rating">
        <button
          v-for="value in ratingValues"
          :key="value"
          type="button"
          :class="['public-field__rating-star', { 'is-active': Number(modelValue) >= value }]"
          :aria-label="String(value)"
          @click="$emit('update:modelValue', value)"
        >
          ★
        </button>
      </div>

      <div v-else-if="field.type === 'nps'" class="public-field__nps">
        <button
          v-for="value in npsValues"
          :key="value"
          type="button"
          :class="['public-field__nps-button', { 'is-active': Number(modelValue) === value }]"
          @click="$emit('update:modelValue', value)"
        >
          {{ value }}
        </button>
      </div>

      <div v-else-if="field.type === 'file_upload'" class="public-field__file">
        <input
          :id="fieldId"
          type="file"
          @change="$emit('update:modelValue', $event.target.files?.[0]?.name ?? '')"
        />
        <small>{{ modelValue || field.placeholder || '' }}</small>
      </div>

      <div v-else class="public-field__unknown">Unsupported field type: {{ field.type }}</div>
    </div>

    <small v-if="error" :id="errorId" class="public-field__error" role="alert">
      {{ error }}
    </small>
  </div>
</template>

<style scoped>
.public-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.public-field--hidden {
  display: none;
}

.public-field--presentational {
  margin: var(--space-2) 0;
}

.public-field__section-title {
  margin: 0 0 var(--space-1) 0;
  font-size: var(--font-size-lg);
  color: var(--color-text);
}

.public-field__text {
  margin: 0;
  color: var(--color-text-muted);
}

.public-field__image {
  width: 100%;
  height: auto;
  display: block;
  border-radius: var(--radius-md);
}

.public-field__divider {
  border: 0;
  border-top: 1px solid var(--color-border);
}

.public-field__page-break {
  border-top: 2px dashed var(--color-primary-300);
}

.public-field__label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.public-field__required {
  color: var(--color-danger-600);
  margin-left: 0.125rem;
}

.public-field__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.public-field__control {
  display: flex;
  flex-direction: column;
}

.public-field__input,
.public-field__textarea {
  width: 100%;
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

.public-field__textarea {
  resize: vertical;
  min-height: 5rem;
}

.public-field__input:focus-visible,
.public-field__textarea:focus-visible {
  outline: 0;
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.public-field--invalid .public-field__input,
.public-field--invalid .public-field__textarea {
  border-color: var(--color-danger-600);
}

.public-field__options {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.public-field__option {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.public-field__option--inline {
  align-items: flex-start;
}

.public-field__yesno {
  display: inline-flex;
  gap: var(--space-2);
}

.public-field__yesno-button {
  padding: 0.375rem 1.25rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  cursor: pointer;
  font: inherit;
}

.public-field__yesno-button.is-active {
  background: var(--color-primary-600);
  color: var(--color-on-primary);
  border-color: var(--color-primary-600);
}

.public-field__rating {
  display: inline-flex;
  gap: var(--space-1);
  font-size: 1.5rem;
}

.public-field__rating-star {
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--color-border);
  padding: 0;
  line-height: 1;
}

.public-field__rating-star.is-active {
  color: var(--color-warning-600);
}

.public-field__nps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.public-field__nps-button {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font: inherit;
  cursor: pointer;
}

.public-field__nps-button.is-active {
  background: var(--color-primary-600);
  color: var(--color-on-primary);
  border-color: var(--color-primary-600);
}

.public-field__file {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.public-field__error {
  color: var(--color-danger-600);
  font-size: var(--font-size-xs);
}

.public-field__unknown {
  font-size: var(--font-size-sm);
  color: var(--color-danger-600);
}
</style>
