<script setup>
import { computed, useId } from 'vue';

const props = defineProps({
  options: { type: Array, default: () => [] },
  modelValue: { type: [String, Array], default: '' },
  multiple: { type: Boolean, default: false },
  maxSelections: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
  labelledby: { type: String, default: undefined },
  describedby: { type: String, default: undefined },
  invalid: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const name = useId();
const hasImages = computed(() => props.options.some((option) => option.imageUrl));
const compact = computed(
  () => props.options.length >= 4 && props.options.every((option) => option.label.length <= 55),
);
const selected = (key) =>
  props.multiple
    ? Array.isArray(props.modelValue) && props.modelValue.includes(key)
    : props.modelValue === key;
const optionDisabled = (key) =>
  props.disabled ||
  (props.multiple &&
    props.maxSelections != null &&
    Array.isArray(props.modelValue) &&
    props.modelValue.length >= props.maxSelections &&
    !selected(key));
const change = (key, checked) => {
  if (optionDisabled(key)) return;
  if (!props.multiple) return emit('update:modelValue', key);
  const values = Array.isArray(props.modelValue)
    ? props.modelValue.filter((value) => value !== key)
    : [];
  if (checked) values.push(key);
  emit('update:modelValue', values);
};
</script>

<template>
  <div
    class="choice-options"
    :class="{
      'choice-options--images': hasImages,
      'choice-options--compact': compact && !hasImages,
    }"
    :role="multiple ? 'group' : 'radiogroup'"
    :aria-labelledby="labelledby"
    :aria-describedby="describedby"
    :aria-invalid="invalid ? 'true' : undefined"
    :aria-required="required ? 'true' : undefined"
  >
    <label
      v-for="option in options"
      :key="option.key"
      class="choice-options__option"
      :class="{ 'is-selected': selected(option.key), 'is-disabled': optionDisabled(option.key) }"
    >
      <input
        :type="multiple ? 'checkbox' : 'radio'"
        :name="name"
        :value="option.key"
        :checked="selected(option.key)"
        :disabled="optionDisabled(option.key)"
        :aria-label="option.label"
        @change="change(option.key, $event.target.checked)"
      />
      <img v-if="option.imageUrl" :src="option.imageUrl" alt="" loading="lazy" />
      <span class="choice-options__description">{{ option.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.choice-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.choice-options__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  min-height: 3.25rem;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  font-size: var(--font-size-md);
  color: var(--public-brand-text, var(--color-text));
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}
.choice-options__option input {
  flex-shrink: 0;
  width: 1.125rem;
  height: 1.125rem;
  margin: 0;
  accent-color: var(--public-brand-primary, var(--color-primary-600));
}
.choice-options__description {
  overflow-wrap: anywhere;
}
.choice-options--compact {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}
.choice-options--images {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: var(--space-3);
}
.choice-options--images .choice-options__option {
  position: relative;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  gap: 0;
  padding: 0;
  overflow: hidden;
  min-height: 4rem;
}
.choice-options--images .choice-options__option input {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  width: 1.25rem;
  height: 1.25rem;
  z-index: 1;
}
.choice-options--images .choice-options__option img {
  display: block;
  width: 100%;
  height: 10rem;
  object-fit: contain;
  background: var(--color-surface-muted);
}
.choice-options--images .choice-options__description {
  display: block;
  padding: var(--space-3) 2.5rem var(--space-3) var(--space-3);
  font-weight: 500;
}
.choice-options__option:hover:not(.is-disabled) {
  border-color: var(--public-brand-primary, var(--color-primary-400));
  background: var(--color-surface-muted);
}
.choice-options__option.is-selected {
  border-color: var(--public-brand-primary, var(--color-primary-600));
  background: color-mix(
    in srgb,
    var(--public-brand-primary, var(--color-primary-600)) 7%,
    var(--color-surface)
  );
  box-shadow: inset 0 0 0 1px var(--public-brand-primary, var(--color-primary-600));
}
.choice-options__option:focus-within {
  outline: 2px solid var(--public-brand-primary, var(--color-primary-600));
  outline-offset: 3px;
}
.choice-options__option.is-disabled {
  cursor: default;
  opacity: 0.55;
}
@media (prefers-reduced-motion: reduce) {
  .choice-options__option {
    transition: none;
  }
}
</style>
