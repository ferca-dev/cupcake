<script setup>
// Renders the preview body for a single field. Pure presentation — controls
// are intentionally disabled because the builder canvas shows what the
// public form will look like, not a working form. Editing happens through
// the inspector.
import { computed } from 'vue';
import { useI18n } from '../../i18n/index.js';
import QuestionImage from '../media/QuestionImage.vue';
import ChoiceOptions from '../public-form/ChoiceOptions.vue';
import { fixedImageOptions } from '../../features/public-form/choice-value.js';
const { t } = useI18n();

const props = defineProps({
  field: { type: Object, required: true },
});

const previewLabel = computed(() => props.field.label || ' ');
const isPresentational = computed(() =>
  ['image_block', 'text_block', 'divider', 'section_title', 'page_break', 'hidden'].includes(
    props.field.type,
  ),
);

const fixedOptions = computed(() =>
  fixedImageOptions(props.field, t).map((option) => ({
    ...option,
    imageUrl: props.field.settings?.optionImages?.find((image) => image.key === option.key)
      ?.imageUrl,
  })),
);
const hasOptionImages = computed(() =>
  (props.field.options ?? []).some((option) => option.imageUrl),
);
const hasFixedImages = computed(() => fixedOptions.value.some((option) => option.imageUrl));
const ratingValues = [1, 2, 3, 4, 5];
const npsValues = Array.from({ length: 11 }, (_, i) => i);
</script>

<template>
  <div class="builder-renderer">
    <QuestionImage
      v-if="field.type !== 'image_block'"
      :src="field.settings?.imageUrl"
      :label="field.label"
    />
    <header v-if="!isPresentational" class="builder-renderer__head">
      <span class="builder-renderer__label">
        {{ previewLabel }}
        <span v-if="field.required" class="builder-renderer__required" aria-hidden="true">*</span>
      </span>
      <small v-if="field.helpText" class="builder-renderer__hint">{{ field.helpText }}</small>
    </header>

    <div class="builder-renderer__control">
      <template
        v-if="field.type === 'short_text' || field.type === 'email' || field.type === 'phone'"
      >
        <input
          type="text"
          class="builder-renderer__input"
          :placeholder="field.placeholder || ''"
          disabled
        />
      </template>

      <template v-else-if="field.type === 'multiple_text'">
        <label
          v-for="(label, index) in field.settings?.mentionLabels ?? []"
          :key="index"
          class="builder-renderer__mention"
        >
          <span>{{ label }}</span>
          <input type="text" class="builder-renderer__input" disabled />
        </label>
      </template>
      <template v-else-if="field.type === 'long_text'">
        <textarea
          class="builder-renderer__textarea"
          rows="3"
          :placeholder="field.placeholder || ''"
          disabled
        />
      </template>

      <template v-else-if="field.type === 'number'">
        <input
          type="number"
          class="builder-renderer__input"
          :placeholder="field.placeholder || ''"
          disabled
        />
      </template>

      <template v-else-if="field.type === 'date'">
        <input type="date" class="builder-renderer__input" disabled />
      </template>

      <template v-else-if="field.type === 'time'">
        <input type="time" class="builder-renderer__input" disabled />
      </template>

      <template v-else-if="field.type === 'select' && !hasOptionImages">
        <select class="builder-renderer__input" disabled>
          <option value="" disabled selected>{{ field.placeholder || 'Select an option' }}</option>
          <option v-for="opt in field.options" :key="opt.id" :value="opt.key">
            {{ opt.label }}
          </option>
        </select>
      </template>

      <ChoiceOptions
        v-else-if="['select', 'radio_group', 'checkbox_group'].includes(field.type)"
        :options="field.options"
        :multiple="field.type === 'checkbox_group'"
        disabled
      />
      <ChoiceOptions
        v-else-if="hasFixedImages"
        :options="fixedOptions"
        :multiple="field.type === 'checkbox'"
        disabled
      />

      <template v-else-if="field.type === 'checkbox'">
        <label class="builder-renderer__option">
          <input type="checkbox" disabled />
          <span>{{ field.label || 'I agree' }}</span>
        </label>
      </template>

      <template v-else-if="field.type === 'yes_no'">
        <div class="builder-renderer__yesno">
          <button type="button" disabled>Yes</button>
          <button type="button" disabled>No</button>
        </div>
      </template>

      <template v-else-if="field.type === 'rating'">
        <div class="builder-renderer__rating">
          <span v-for="value in ratingValues" :key="value" class="builder-renderer__star">★</span>
        </div>
      </template>

      <template v-else-if="field.type === 'nps'">
        <div class="builder-renderer__nps">
          <button v-for="value in npsValues" :key="value" type="button" disabled>
            {{ value }}
          </button>
        </div>
      </template>

      <template v-else-if="field.type === 'file_upload'">
        <div class="builder-renderer__file">
          <span>📎 {{ field.placeholder || 'Click to upload a file' }}</span>
        </div>
      </template>

      <template v-else-if="field.type === 'hidden'">
        <div class="builder-renderer__hidden">
          <strong>Hidden field</strong>
          <small>{{ field.key || 'no_key' }} — not shown to respondents</small>
        </div>
      </template>

      <template v-else-if="field.type === 'section_title'">
        <h3 class="builder-renderer__section-title">{{ field.label || 'Section title' }}</h3>
      </template>

      <template v-else-if="field.type === 'text_block'">
        <p class="builder-renderer__text-block">{{ field.label || 'Text block' }}</p>
      </template>

      <template v-else-if="field.type === 'image_block'">
        <div class="builder-renderer__image">
          <img v-if="field.settings?.imageUrl" :src="field.settings.imageUrl" alt="" />
          <div v-else class="builder-renderer__image-placeholder">
            🖼 Add an image URL in the inspector
          </div>
        </div>
      </template>

      <template v-else-if="field.type === 'divider'">
        <hr class="builder-renderer__divider" />
      </template>

      <template v-else-if="field.type === 'page_break'">
        <div class="builder-renderer__page-break">
          <span>Page break</span>
        </div>
      </template>

      <template v-else>
        <div class="builder-renderer__unknown">Unsupported field type: {{ field.type }}</div>
      </template>
      <input
        v-if="field.options?.some((option) => option.isOther)"
        class="builder-renderer__input"
        :placeholder="t('questionExtensions.otherText')"
        disabled
      />
    </div>
  </div>
</template>

<style scoped>
.builder-renderer__mention {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}
.builder-renderer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.builder-renderer__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.builder-renderer__label {
  font-weight: 500;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.builder-renderer__required {
  color: var(--color-danger-600);
  margin-left: 0.125rem;
}

.builder-renderer__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.builder-renderer__input,
.builder-renderer__textarea {
  width: 100%;
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
}

.builder-renderer__textarea {
  resize: none;
  min-height: 4rem;
}

.builder-renderer__options {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.builder-renderer__option {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.builder-renderer__yesno {
  display: inline-flex;
  gap: var(--space-2);
}

.builder-renderer__yesno button {
  padding: 0.375rem 1rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  cursor: not-allowed;
}

.builder-renderer__rating {
  display: inline-flex;
  gap: var(--space-1);
  font-size: 1.25rem;
  color: var(--color-warning-600);
}

.builder-renderer__nps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.builder-renderer__nps button {
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: var(--font-size-xs);
}

.builder-renderer__file,
.builder-renderer__hidden {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.builder-renderer__section-title {
  margin: 0;
  font-size: var(--font-size-xl);
  color: var(--color-text);
}

.builder-renderer__text-block {
  margin: 0;
  color: var(--color-text-muted);
}

.builder-renderer__image {
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface-muted);
}

.builder-renderer__image img {
  width: 100%;
  height: auto;
  display: block;
}

.builder-renderer__image-placeholder {
  padding: var(--space-5);
  text-align: center;
  color: var(--color-text-muted);
}

.builder-renderer__divider {
  border: 0;
  border-top: 1px dashed var(--color-border);
  margin: 0;
}

.builder-renderer__page-break {
  border-top: 2px dashed var(--color-primary-300);
  text-align: center;
  margin-top: var(--space-2);
  padding-top: var(--space-1);
  color: var(--color-primary-700);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.builder-renderer__unknown {
  font-size: var(--font-size-sm);
  color: var(--color-danger-600);
}
</style>
