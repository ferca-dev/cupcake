<script setup>
// Auto-fitting grid of `DashboardKpi` cards. Acts purely as a layout
// container so the parent view can pass any KPI mix.
</script>

<template>
  <div class="dashboard-kpi-grid">
    <slot />
  </div>
</template>

<style scoped>
.dashboard-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--space-3);
}
</style>
