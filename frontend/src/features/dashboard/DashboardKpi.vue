<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: 0 },
  hint: { type: String, default: '' },
  tone: {
    type: String,
    default: 'neutral',
    validator: (v) => ['neutral', 'primary', 'success', 'warning', 'danger'].includes(v),
  },
});
</script>

<template>
  <article class="dashboard-kpi" :class="`dashboard-kpi--${tone}`">
    <p class="dashboard-kpi__label">{{ label }}</p>
    <p class="dashboard-kpi__value">{{ value }}</p>
    <p v-if="hint" class="dashboard-kpi__hint">{{ hint }}</p>
  </article>
</template>

<style scoped>
.dashboard-kpi {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 6rem;
}

.dashboard-kpi__label {
  margin: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.dashboard-kpi__value {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.1;
}

.dashboard-kpi__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.dashboard-kpi--primary .dashboard-kpi__value {
  color: var(--color-primary-700, var(--color-primary-500));
}
.dashboard-kpi--success .dashboard-kpi__value {
  color: var(--color-success-700, var(--color-text));
}
.dashboard-kpi--warning .dashboard-kpi__value {
  color: var(--color-warning-700, var(--color-text));
}
.dashboard-kpi--danger .dashboard-kpi__value {
  color: var(--color-danger-700, var(--color-text));
}
</style>
