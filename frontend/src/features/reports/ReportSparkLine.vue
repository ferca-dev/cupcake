<script setup>
// Plain SVG sparkline used by the trends panel to show a daily response
// count without pulling in a chart dependency. The component accepts an
// ordered array of `{ label, value }` points and scales them into a 100x36
// viewBox, drawing a polyline plus point markers.
import { computed } from 'vue';

const props = defineProps({
  points: { type: Array, default: () => [] },
  width: { type: Number, default: 320 },
  height: { type: Number, default: 80 },
  ariaLabel: { type: String, default: 'Trend chart' },
});

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 36;

const projected = computed(() => {
  if (!props.points.length) return [];
  let max = 0;
  for (const point of props.points) {
    if (point.value > max) max = point.value;
  }
  if (props.points.length === 1) {
    const onlyValue = props.points[0].value ?? 0;
    return [
      {
        x: VIEW_WIDTH / 2,
        y: max === 0 ? VIEW_HEIGHT - 2 : VIEW_HEIGHT - (onlyValue / max) * (VIEW_HEIGHT - 4) - 2,
        ...props.points[0],
      },
    ];
  }
  const stepX = VIEW_WIDTH / (props.points.length - 1);
  return props.points.map((point, idx) => {
    const ratio = max === 0 ? 0 : (point.value ?? 0) / max;
    return {
      x: stepX * idx,
      y: VIEW_HEIGHT - ratio * (VIEW_HEIGHT - 4) - 2,
      ...point,
    };
  });
});

const polyline = computed(() => projected.value.map((p) => `${p.x},${p.y}`).join(' '));
</script>

<template>
  <svg
    :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
    :width="width"
    :height="height"
    :aria-label="ariaLabel"
    role="img"
    class="report-spark-line"
    preserveAspectRatio="none"
  >
    <polyline v-if="projected.length > 1" :points="polyline" class="report-spark-line__line" />
    <circle
      v-for="(point, idx) in projected"
      :key="idx"
      :cx="point.x"
      :cy="point.y"
      r="0.8"
      class="report-spark-line__point"
    />
  </svg>
</template>

<style scoped>
.report-spark-line {
  display: block;
  width: 100%;
}

.report-spark-line__line {
  fill: none;
  stroke: var(--color-primary-500);
  stroke-width: 0.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.report-spark-line__point {
  fill: var(--color-primary-700);
}
</style>
