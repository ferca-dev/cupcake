<script setup>
// Renders a single field of a published form as an interactive control.
// Pure presentation — state lives in the parent form view, which passes the
// current value and listens for `update:modelValue`. The wrapper handles the
// label, required indicator, help text, and error message; the inner
// template just provides the type-specific control.
import { computed, useId } from 'vue';
import { useI18n } from '../../i18n/index.js';
import {
  choiceValue,
  selectedOtherOption,
  fixedImageOptions,
} from '../../features/public-form/choice-value.js';
import QuestionImage from '../media/QuestionImage.vue';
import ChoiceOptions from './ChoiceOptions.vue';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: {
    type: [String, Number, Boolean, Array, Object],
    default: null,
  },
  error: { type: String, default: '' },
  number: { type: Number, default: null },
});

const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();
const selected = computed(() => choiceValue(props.modelValue));
const otherOption = computed(() => selectedOtherOption(props.field, props.modelValue));
const hasOptionImages = computed(() =>
  (props.field.options ?? []).some((option) => option.imageUrl),
);
const fixedOptions = computed(() =>
  fixedImageOptions(props.field, t).map((option) => ({
    ...option,
    imageUrl: props.field.settings?.optionImages?.find((image) => image.key === option.key)
      ?.imageUrl,
  })),
);
const hasFixedImages = computed(() => fixedOptions.value.some((option) => option.imageUrl));
const fixedValue = computed(() =>
  props.field.type === 'checkbox'
    ? props.modelValue === true
      ? ['true']
      : []
    : props.modelValue == null
      ? ''
      : String(props.modelValue),
);
const updateFixedChoice = (value) => {
  const typed =
    props.field.type === 'checkbox'
      ? value.includes('true')
      : props.field.type === 'yes_no'
        ? value === 'true'
        : Number(value);
  emit('update:modelValue', typed);
};
const updateChoice = (value) => {
  if ((props.field.options ?? []).some((option) => option.isOther)) {
    emit('update:modelValue', {
      selected: value,
      otherText: selectedOtherOption(props.field, value) ? (props.modelValue?.otherText ?? '') : '',
    });
  } else emit('update:modelValue', value);
};
const exclusiveMentionSelected = computed(
  () => Boolean(props.field.settings?.exclusiveOption) && props.modelValue?.exclusive === true,
);
const updateExclusiveMention = (values) => {
  emit(
    'update:modelValue',
    values.includes('exclusive')
      ? { exclusive: true }
      : (props.field.settings?.mentionLabels ?? []).map(() => ''),
  );
};
const updateMention = (index, value) => {
  if (exclusiveMentionSelected.value) return;
  const mentions = (props.field.settings?.mentionLabels ?? []).map(
    (_, i) => props.modelValue?.[i] ?? '',
  );
  mentions[index] = value;
  emit('update:modelValue', mentions);
};

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
const selectionHint = computed(() => {
  if (['radio_group', 'select'].includes(props.field.type)) return t('publicForm.chooseOne');
  if (props.field.type === 'checkbox_group') {
    return props.field.validation?.max != null
      ? t('publicForm.chooseUpTo', { max: props.field.validation.max })
      : t('publicForm.chooseSeveral');
  }
  return '';
});
const describedBy = computed(() => {
  const ids = [];
  if (props.field.helpText) ids.push(`${fieldId.value}-hint`);
  if (selectionHint.value) ids.push(`${fieldId.value}-selection-hint`);
  if (props.error) ids.push(errorId.value);
  return ids.length ? ids.join(' ') : undefined;
});

const onTextInput = (event, emit) => emit('update:modelValue', event.target.value);
const onNumberInput = (event, emit) => {
  const raw = event.target.value;
  if (raw === '') emit('update:modelValue', '');
  else emit('update:modelValue', raw);
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
    <QuestionImage
      v-if="field.type !== 'image_block'"
      :src="field.settings?.imageUrl"
      :label="field.label"
    />
  </section>

  <div
    v-else
    class="public-field"
    :class="{ 'public-field--invalid': error }"
    :data-field-id="field.id"
    :data-field-type="field.type"
    tabindex="-1"
  >
    <div v-if="number" class="public-field__meta">
      <span class="public-field__number">{{
        t('publicForm.questionNumber', { number: String(number).padStart(2, '0') })
      }}</span>
      <span class="public-field__status">{{
        field.required ? t('publicForm.required') : t('publicForm.optional')
      }}</span>
    </div>
    <QuestionImage :src="field.settings?.imageUrl" :label="field.label" />

    <label
      v-if="field.type !== 'checkbox' || hasFixedImages"
      :id="`${fieldId}-label`"
      :for="fieldId"
      class="public-field__label"
    >
      {{ field.label || '' }}
      <span v-if="field.required" class="public-field__required" aria-hidden="true">*</span>
    </label>

    <small v-if="field.helpText" :id="`${fieldId}-hint`" class="public-field__hint">
      {{ field.helpText }}
    </small>

    <small v-if="selectionHint" :id="`${fieldId}-selection-hint`" class="public-field__hint">
      {{ selectionHint }}
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

      <div
        v-else-if="field.type === 'multiple_text'"
        :id="fieldId"
        class="public-field__options"
        role="group"
        :aria-labelledby="`${fieldId}-label`"
        :aria-describedby="describedBy"
        :aria-invalid="error ? 'true' : undefined"
      >
        <label
          v-for="(label, index) in field.settings?.mentionLabels ?? []"
          :key="index"
          class="public-field__mention"
        >
          <span>{{ label }}</span>
          <input
            type="text"
            class="public-field__input"
            :value="exclusiveMentionSelected ? '' : (modelValue?.[index] ?? '')"
            :disabled="exclusiveMentionSelected"
            :maxlength="field.validation?.maxLength ?? 500"
            :placeholder="field.placeholder"
            :aria-describedby="describedBy"
            @input="updateMention(index, $event.target.value)"
          />
        </label>
        <ChoiceOptions
          v-if="field.settings?.exclusiveOption"
          class="public-field__exclusive"
          :options="[{ key: 'exclusive', ...field.settings.exclusiveOption }]"
          :model-value="exclusiveMentionSelected ? ['exclusive'] : []"
          multiple
          :labelledby="`${fieldId}-label`"
          :describedby="describedBy"
          :invalid="Boolean(error)"
          @update:model-value="updateExclusiveMention"
        />
      </div>

      <select
        v-else-if="field.type === 'select' && !hasOptionImages"
        :id="fieldId"
        class="public-field__input"
        :value="selected"
        :required="field.required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @change="updateChoice($event.target.value)"
      >
        <option value="" disabled>
          {{ field.placeholder || t('publicForm.selectPlaceholder') }}
        </option>
        <option v-for="opt in field.options ?? []" :key="opt.key" :value="opt.key">
          {{ opt.label }}
        </option>
      </select>

      <ChoiceOptions
        v-else-if="['select', 'radio_group', 'checkbox_group'].includes(field.type)"
        :id="fieldId"
        :options="field.options"
        :model-value="selected"
        :multiple="field.type === 'checkbox_group'"
        :max-selections="field.type === 'checkbox_group' ? field.validation?.max : null"
        :labelledby="`${fieldId}-label`"
        :describedby="describedBy"
        :invalid="Boolean(error)"
        :required="field.required"
        @update:model-value="updateChoice"
      />
      <ChoiceOptions
        v-else-if="hasFixedImages"
        :id="fieldId"
        :options="fixedOptions"
        :model-value="fixedValue"
        :multiple="field.type === 'checkbox'"
        :labelledby="`${fieldId}-label`"
        :describedby="describedBy"
        :invalid="Boolean(error)"
        :required="field.required"
        @update:model-value="updateFixedChoice"
      />

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
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="describedBy"
          @change="$emit('update:modelValue', $event.target.checked)"
        />
        <span>
          {{ field.label || '' }}
          <span v-if="field.required" class="public-field__required" aria-hidden="true">*</span>
        </span>
      </label>

      <div
        v-else-if="field.type === 'yes_no'"
        :id="fieldId"
        class="public-field__yesno"
        role="group"
        :aria-labelledby="`${fieldId}-label`"
        :aria-describedby="describedBy"
        :aria-invalid="error ? 'true' : undefined"
      >
        <button
          type="button"
          :class="['public-field__yesno-button', { 'is-active': modelValue === true }]"
          :aria-pressed="modelValue === true"
          @click="$emit('update:modelValue', true)"
        >
          <slot name="yes">Yes</slot>
        </button>
        <button
          type="button"
          :class="['public-field__yesno-button', { 'is-active': modelValue === false }]"
          :aria-pressed="modelValue === false"
          @click="$emit('update:modelValue', false)"
        >
          <slot name="no">No</slot>
        </button>
      </div>

      <div
        v-else-if="field.type === 'rating'"
        :id="fieldId"
        class="public-field__rating"
        role="group"
        :aria-labelledby="`${fieldId}-label`"
        :aria-describedby="describedBy"
        :aria-invalid="error ? 'true' : undefined"
      >
        <button
          v-for="value in ratingValues"
          :key="value"
          type="button"
          :class="[
            'public-field__rating-star',
            { 'is-active': modelValue != null && modelValue !== '' && Number(modelValue) >= value },
          ]"
          :aria-label="
            t('publicForm.ratingValue', { value, max: ratingValues[ratingValues.length - 1] })
          "
          :aria-pressed="modelValue != null && modelValue !== '' && Number(modelValue) === value"
          @click="$emit('update:modelValue', value)"
        >
          ★
        </button>
      </div>

      <div
        v-else-if="field.type === 'nps'"
        :id="fieldId"
        class="public-field__nps"
        role="group"
        :aria-labelledby="`${fieldId}-label`"
        :aria-describedby="describedBy"
        :aria-invalid="error ? 'true' : undefined"
      >
        <button
          v-for="value in npsValues"
          :key="value"
          type="button"
          :class="[
            'public-field__nps-button',
            {
              'is-active': modelValue != null && modelValue !== '' && Number(modelValue) === value,
            },
          ]"
          :aria-pressed="modelValue != null && modelValue !== '' && Number(modelValue) === value"
          @click="$emit('update:modelValue', value)"
        >
          {{ value }}
        </button>
      </div>

      <div v-else-if="field.type === 'file_upload'" class="public-field__file">
        <input
          :id="fieldId"
          type="file"
          :required="field.required"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="describedBy"
          @change="$emit('update:modelValue', $event.target.files?.[0]?.name ?? '')"
        />
        <small>{{ modelValue || field.placeholder || '' }}</small>
      </div>

      <div v-else class="public-field__unknown">Unsupported field type: {{ field.type }}</div>
      <label v-if="otherOption" class="public-field__mention">
        <span>{{ otherOption.label }}: {{ t('questionExtensions.otherText') }}</span>
        <input
          type="text"
          class="public-field__input"
          :value="modelValue?.otherText ?? ''"
          maxlength="1000"
          required
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="describedBy"
          @input="$emit('update:modelValue', { selected, otherText: $event.target.value })"
        />
      </label>
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
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  scroll-margin-top: calc(var(--survey-progress-top, var(--space-3)) + 8rem);
  overflow-wrap: anywhere;
}
.public-field:focus-within {
  border-color: var(--public-brand-primary, var(--color-primary-300));
}
.public-field--invalid {
  border-color: var(--color-danger-600);
}
.public-field--hidden {
  display: none;
}
.public-field--presentational {
  padding: var(--space-4) var(--space-2) 0;
  border: 0;
  background: transparent;
}
.public-field--presentational[data-field-type='page_break'] {
  padding: 0;
}
.public-field__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  font-size: var(--font-size-xs);
}
.public-field__number {
  color: var(--public-brand-primary, var(--color-primary-600));
  font-weight: 600;
  letter-spacing: 0.04em;
}
.public-field__status {
  color: var(--color-text-muted);
}
.public-field__section-title {
  margin: 0;
  font-size: var(--font-size-xl);
  line-height: 1.45;
  color: var(--public-brand-text, var(--color-text));
}
.public-field__text {
  margin: 0;
  color: var(--color-text-muted);
  white-space: pre-line;
}
.public-field__image {
  width: 100%;
  height: auto;
  display: block;
  border-radius: var(--radius-md);
}
.public-field__divider,
.public-field__page-break {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--color-border);
}
.public-field__label {
  font-weight: 600;
  font-size: var(--font-size-lg);
  line-height: 1.5;
  color: var(--public-brand-text, var(--color-text));
}
.public-field__required {
  color: var(--color-danger-600);
  margin-left: 0.125rem;
}
.public-field__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  white-space: pre-line;
}
.public-field__control {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-top: var(--space-2);
}
.public-field__input,
.public-field__textarea {
  width: 100%;
  min-width: 0;
  min-height: 3rem;
  font: inherit;
  font-size: var(--font-size-md);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
}
.public-field__textarea {
  resize: vertical;
  min-height: 8rem;
}
.public-field__input:focus-visible,
.public-field__textarea:focus-visible {
  outline: 2px solid var(--public-brand-primary, var(--color-primary-600));
  outline-offset: 2px;
  border-color: var(--public-brand-primary, var(--color-primary-600));
}
.public-field--invalid .public-field__input,
.public-field--invalid .public-field__textarea {
  border-color: var(--color-danger-600);
}
.public-field__input:disabled {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  cursor: not-allowed;
}
.public-field__options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.public-field__mention {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
.public-field__exclusive {
  margin-top: var(--space-3);
}
.public-field__option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--public-brand-text, var(--color-text));
  font-size: var(--font-size-md);
  cursor: pointer;
}
.public-field__option input {
  flex-shrink: 0;
  width: 1.125rem;
  height: 1.125rem;
  margin-top: var(--space-1);
  accent-color: var(--public-brand-primary, var(--color-primary-600));
}
.public-field__yesno,
.public-field__rating,
.public-field__nps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.public-field__yesno-button,
.public-field__nps-button,
.public-field__rating-star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.75rem;
  min-height: 2.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.public-field__yesno-button {
  flex: 1;
  padding: var(--space-3) var(--space-5);
}
.public-field__rating-star {
  color: var(--color-text-subtle);
  font-size: 1.75rem;
  line-height: 1;
}
.public-field__rating-star.is-active {
  color: var(--color-warning-600);
  border-color: var(--color-warning-600);
}
.public-field__nps-button {
  flex: 1 0 2.75rem;
}
.public-field__yesno-button.is-active,
.public-field__nps-button.is-active {
  background: var(--public-brand-primary, var(--color-primary-600));
  color: var(--color-on-primary);
  border-color: var(--public-brand-primary, var(--color-primary-600));
}
.public-field__control button:hover:not(:disabled) {
  border-color: var(--public-brand-primary, var(--color-primary-600));
}
.public-field__control button:focus-visible,
.public-field__option:focus-within {
  outline: 2px solid var(--public-brand-primary, var(--color-primary-600));
  outline-offset: 3px;
}
.public-field__control button:disabled {
  cursor: default;
  opacity: 0.6;
}
.public-field__file {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.public-field__file input {
  width: 100%;
  min-width: 0;
  font: inherit;
}
.public-field__error {
  margin-top: var(--space-2);
  color: var(--color-danger-700);
  font-size: var(--font-size-sm);
}
.public-field__unknown {
  font-size: var(--font-size-sm);
  color: var(--color-danger-600);
}
@media (max-width: 600px) {
  .public-field {
    padding: var(--space-5) var(--space-4);
  }
  .public-field--presentational {
    padding: var(--space-3) var(--space-1) 0;
  }
  .public-field__label {
    font-size: var(--font-size-md);
  }
  .public-field__nps-button {
    flex: 0 0 calc((100% - 5 * var(--space-2)) / 6);
  }
}
@media (prefers-reduced-motion: reduce) {
  .public-field__input,
  .public-field__textarea {
    transition: none;
  }
}
</style>
