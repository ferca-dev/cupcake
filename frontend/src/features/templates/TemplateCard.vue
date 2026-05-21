<script setup>
// Renders a single template tile. Emits `use` (start a survey from the
// template) and `edit` / `delete` (only meaningful when the caller owns the
// template, controlled by the parent view).
import { computed } from 'vue';

import { useI18n } from '../../i18n/index.js';
import { AppBadge, AppButton, AppCard } from '../../components/ui/index.js';

const props = defineProps({
  template: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
  canUse: { type: Boolean, default: true },
});

const emit = defineEmits(['use', 'edit', 'delete']);

const { t } = useI18n();

const categoryLabel = computed(() => {
  const key = `templates.categories.${props.template.category}`;
  const label = t(key);
  return label === key ? props.template.category : label;
});

const fieldCount = computed(() => props.template?.schema?.fields?.length ?? 0);
</script>

<template>
  <AppCard padded class="template-card">
    <header class="template-card__header">
      <div class="template-card__title">
        <h3>{{ template.title }}</h3>
        <AppBadge v-if="template.isSystemTemplate" variant="info">
          {{ t('templates.badges.system') }}
        </AppBadge>
        <AppBadge v-else variant="neutral">
          {{ t('templates.badges.tenant') }}
        </AppBadge>
        <AppBadge v-if="template.status === 'inactive'" variant="warning">
          {{ t('templates.badges.inactive') }}
        </AppBadge>
      </div>
      <p v-if="template.description" class="template-card__description">
        {{ template.description }}
      </p>
    </header>

    <dl class="template-card__meta">
      <div>
        <dt>{{ t('templates.card.category') }}</dt>
        <dd>{{ categoryLabel }}</dd>
      </div>
      <div>
        <dt>{{ t('templates.card.fields') }}</dt>
        <dd>{{ fieldCount }}</dd>
      </div>
    </dl>

    <footer class="template-card__footer">
      <AppButton :disabled="!canUse" @click="emit('use', template)">
        {{ t('templates.card.use') }}
      </AppButton>
      <AppButton v-if="canEdit" variant="secondary" size="sm" @click="emit('edit', template)">
        {{ t('common.edit') }}
      </AppButton>
      <AppButton v-if="canEdit" variant="ghost" size="sm" @click="emit('delete', template)">
        {{ t('common.delete') }}
      </AppButton>
    </footer>
  </AppCard>
</template>

<style scoped>
.template-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
}

.template-card__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.template-card__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.template-card__title h3 {
  margin: 0;
  font-size: var(--font-size-lg);
}

.template-card__description {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.template-card__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  font-size: var(--font-size-sm);
}

.template-card__meta dt {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-1) 0;
}

.template-card__meta dd {
  margin: 0;
  font-weight: 500;
}

.template-card__footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: auto;
}
</style>
