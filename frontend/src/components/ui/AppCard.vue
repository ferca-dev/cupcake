<script setup>
// Generic surface container with optional `title` slot and `actions` slot.
// Reach for AppCard whenever a section needs a contained, raised surface.
defineProps({
  padded: { type: Boolean, default: true },
});
</script>

<template>
  <section class="app-card" :class="{ 'app-card--flat': !padded }">
    <header v-if="$slots.title || $slots.actions" class="app-card__header">
      <h3 v-if="$slots.title" class="app-card__title"><slot name="title" /></h3>
      <div v-if="$slots.actions" class="app-card__actions"><slot name="actions" /></div>
    </header>
    <div class="app-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="app-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.app-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}

.app-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.app-card__title {
  margin: 0;
  font-size: var(--font-size-md);
}

.app-card__actions {
  margin-left: auto;
  display: inline-flex;
  gap: var(--space-2);
}

.app-card__body {
  padding: var(--space-5);
}

.app-card--flat .app-card__body {
  padding: 0;
}

.app-card__footer {
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
