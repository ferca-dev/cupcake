<script setup>
defineProps({ src: { type: String, default: '' }, label: { type: String, default: '' } });
</script>

<template>
  <figure v-if="src" class="question-image">
    <img :src="src" :alt="label" loading="lazy" />
  </figure>
</template>

<style scoped>
.question-image {
  width: 100%;
  min-width: 0;
  margin: 0 0 var(--space-2);
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}
.question-image img {
  display: block;
  width: 100%;
  max-height: 22rem;
  object-fit: contain;
}
</style>
