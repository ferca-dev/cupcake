<script setup>
import { computed, useId } from 'vue';

const props = defineProps({
  options: { type: Array, default: () => [] },
  modelValue: { type: [String, Array], default: '' },
  multiple: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  labelledby: { type: String, default: undefined },
  describedby: { type: String, default: undefined },
  invalid: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const name = useId();
const hasImages = computed(() => props.options.some((option) => option.imageUrl));
const selected = (key) =>
  props.multiple
    ? Array.isArray(props.modelValue) && props.modelValue.includes(key)
    : props.modelValue === key;
const change = (key, checked) => {
  if (props.disabled) return;
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
    :class="{ 'choice-options--images': hasImages }"
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
      :class="{ 'is-selected': selected(option.key), 'is-disabled': disabled }"
    >
      <input
        :type="multiple ? 'checkbox' : 'radio'"
        :name="name"
        :value="option.key"
        :checked="selected(option.key)"
        :disabled="disabled"
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
  gap: var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text);
  min-width: 0;
}
.choice-options__option input {
  flex-shrink: 0;
  accent-color: var(--color-primary-600);
}
.choice-options__description {
  overflow-wrap: anywhere;
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
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
  min-height: 4rem;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}
.choice-options--images .choice-options__option input {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  margin: 0;
  width: 1.2rem;
  height: 1.2rem;
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
  padding: var(--space-3) 2.2rem var(--space-3) var(--space-3);
  font-weight: 500;
}
.choice-options--images .choice-options__option:hover:not(.is-disabled) {
  border-color: var(--color-primary-400);
}
.choice-options--images .choice-options__option.is-selected {
  border-color: var(--color-primary-600);
  background: var(--color-primary-100);
  box-shadow: 0 0 0 1px var(--color-primary-600);
}
.choice-options--images .choice-options__option:focus-within {
  outline: 3px solid var(--color-primary-300);
  outline-offset: 3px;
}
.choice-options__option.is-disabled {
  cursor: default;
}
@media (prefers-reduced-motion: reduce) {
  .choice-options--images .choice-options__option {
    transition: none;
  }
}
</style>
