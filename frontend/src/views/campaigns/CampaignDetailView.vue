<script setup>
// Campaign detail view. Shows the campaign metadata, current report, every
// recipient (with channel, status, and skip/failure reason), and a "Send
// now" action when the campaign is still in a sendable state.
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useCampaignsStore } from '../../stores/campaigns.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppLoader,
  AppTable,
} from '../../components/ui/index.js';

const route = useRoute();
const router = useRouter();
const store = useCampaignsStore();
const { t } = useI18n();

const SENDABLE_STATUSES = new Set(['draft', 'queued', 'failed']);

const campaign = computed(() => store.currentCampaign);
const report = computed(() => store.currentReport);
const recipients = computed(() => store.currentRecipients);

const canSend = computed(() =>
  campaign.value ? SENDABLE_STATUSES.has(campaign.value.status) : false,
);

const recipientColumns = computed(() => [
  { key: 'channel', label: t('campaigns.list.columns.channels') },
  { key: 'recipient', label: 'Recipient' },
  { key: 'status', label: t('campaigns.list.columns.status') },
  { key: 'reason', label: 'Reason' },
  { key: 'token', label: 'Token' },
]);

const refresh = () => {
  if (route.params.id) {
    store.fetchCampaignDetail(String(route.params.id)).catch(() => {});
  }
};

onMounted(() => {
  store.resetCurrent();
  refresh();
});

watch(
  () => route.params.id,
  () => {
    store.resetCurrent();
    refresh();
  },
);

const back = () => router.push({ name: 'campaigns.list' });

const handleSend = async () => {
  if (typeof window !== 'undefined') {
    const ok = window.confirm(t('campaigns.detail.sendConfirm'));
    if (!ok) return;
  }
  try {
    await store.sendCampaign(String(route.params.id));
  } catch {
    // store.lastError displays the message via the alert.
  }
};

const statusVariant = (status) => {
  switch (status) {
    case 'completed':
    case 'sent':
    case 'delivered':
      return 'success';
    case 'opened':
    case 'clicked':
      return 'info';
    case 'completed_with_errors':
    case 'skipped':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
};

const skipReasonLabel = (key) => t(`campaigns.skipReasons.${key}`, { defaultValue: key });

const skippedReasonsEntries = computed(() => {
  const reasons = report.value?.skippedReasons ?? {};
  return Object.entries(reasons).map(([key, count]) => ({ key, count }));
});
</script>

<template>
  <section class="campaign-detail">
    <header class="campaign-detail__header">
      <div>
        <AppButton variant="ghost" size="sm" @click="back">
          ← {{ t('campaigns.detail.backToList') }}
        </AppButton>
        <h2 v-if="campaign">{{ campaign.name }}</h2>
      </div>
      <AppButton v-if="campaign && canSend" :loading="store.isSending" @click="handleSend">
        {{ store.isSending ? t('campaigns.detail.sending') : t('campaigns.detail.sendNow') }}
      </AppButton>
    </header>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>

    <AppLoader v-if="store.isLoadingDetail && !campaign" />

    <template v-else-if="campaign">
      <div class="campaign-detail__grid">
        <AppCard padded>
          <template #title>{{ t('campaigns.detail.summaryTitle') }}</template>
          <dl class="campaign-detail__stats">
            <div>
              <dt>{{ t('campaigns.detail.stats.selected') }}</dt>
              <dd>{{ campaign.summary?.selectedCount ?? 0 }}</dd>
            </div>
            <div>
              <dt>{{ t('campaigns.detail.stats.valid') }}</dt>
              <dd>{{ campaign.summary?.validCount ?? 0 }}</dd>
            </div>
            <div>
              <dt>{{ t('campaigns.detail.stats.sent') }}</dt>
              <dd>{{ campaign.summary?.sentCount ?? 0 }}</dd>
            </div>
            <div>
              <dt>{{ t('campaigns.detail.stats.failed') }}</dt>
              <dd>{{ campaign.summary?.failedCount ?? 0 }}</dd>
            </div>
            <div>
              <dt>{{ t('campaigns.detail.stats.skipped') }}</dt>
              <dd>{{ campaign.summary?.skippedCount ?? 0 }}</dd>
            </div>
          </dl>
          <p>
            <AppBadge :variant="statusVariant(campaign.status)">
              {{ t(`campaigns.statuses.${campaign.status}`, { defaultValue: campaign.status }) }}
            </AppBadge>
          </p>
        </AppCard>

        <AppCard padded>
          <template #title>{{ t('campaigns.detail.skippedReasonsTitle') }}</template>
          <ul v-if="skippedReasonsEntries.length" class="campaign-detail__reasons">
            <li v-for="entry in skippedReasonsEntries" :key="entry.key">
              <span>{{ skipReasonLabel(entry.key) }}</span>
              <strong>{{ entry.count }}</strong>
            </li>
          </ul>
          <p v-else>—</p>
        </AppCard>
      </div>

      <AppCard padded>
        <template #title>{{ t('campaigns.detail.recipientsTitle') }}</template>
        <AppTable
          :columns="recipientColumns"
          :rows="recipients"
          row-key="id"
          :empty="t('campaigns.detail.recipientsEmpty')"
        >
          <template #cell:channel="{ row }">
            <AppBadge variant="info">
              {{ t(`campaigns.channels.${row.channel}`) }}
            </AppBadge>
          </template>
          <template #cell:recipient="{ row }">{{ row.recipient || '—' }}</template>
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">
              {{ t(`campaigns.recipientStatuses.${row.status}`, { defaultValue: row.status }) }}
            </AppBadge>
          </template>
          <template #cell:reason="{ row }">
            <span v-if="row.status === 'skipped'">{{ skipReasonLabel(row.skippedReason) }}</span>
            <span v-else-if="row.status === 'failed'">{{ row.failureReason || '—' }}</span>
            <span v-else>—</span>
          </template>
          <template #cell:token="{ row }">
            <code class="campaign-detail__token">{{ row.submissionToken }}</code>
          </template>
        </AppTable>
      </AppCard>
    </template>
  </section>
</template>

<style scoped>
.campaign-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.campaign-detail__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.campaign-detail__header h2 {
  margin: var(--space-2) 0 0 0;
}

.campaign-detail__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}

.campaign-detail__stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-2);
  margin: 0 0 var(--space-2) 0;
}

.campaign-detail__stats dt {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  margin: 0;
}

.campaign-detail__stats dd {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.campaign-detail__reasons {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.campaign-detail__reasons li {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.campaign-detail__token {
  font-size: var(--font-size-xs);
  background: var(--color-surface-muted);
  padding: 0.125rem 0.25rem;
  border-radius: var(--radius-sm);
}
</style>
