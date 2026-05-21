<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <section class="public-form-placeholder">
    <h1>Public form</h1>
    <p>
      Slug: <code>{{ route.params.slug }}</code>
    </p>
    <p>
      Public form rendering is wired up in Phase 06. This placeholder exists so the layout, route,
      and slug resolution are available end-to-end while later phases build the renderer.
    </p>
  </section>
</template>

<style scoped>
.public-form-placeholder {
  max-width: 36rem;
  margin: 0 auto;
  background: var(--color-surface);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.public-form-placeholder code {
  background: var(--color-surface-muted);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
}
</style>
