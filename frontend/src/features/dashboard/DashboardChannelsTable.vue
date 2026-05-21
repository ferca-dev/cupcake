<script setup>
import { computed } from 'vue';

import { AppTable } from '../../components/ui/index.js';
import { useI18n } from '../../i18n/index.js';

const props = defineProps({
  channels: {
    // Array<{ channel, attempted, sent, failed, skipped, pending }>
    type: Array,
    default: () => [],
  },
  empty: { type: String, default: '' },
});

const { t } = useI18n();

const columns = computed(() => [
  { key: 'channelLabel', label: t('dashboard.client.channelHeaders.channel') },
  { key: 'attempted', label: t('dashboard.client.channelHeaders.attempted'), align: 'right' },
  { key: 'sent', label: t('dashboard.client.channelHeaders.sent'), align: 'right' },
  { key: 'failed', label: t('dashboard.client.channelHeaders.failed'), align: 'right' },
  { key: 'skipped', label: t('dashboard.client.channelHeaders.skipped'), align: 'right' },
  { key: 'pending', label: t('dashboard.client.channelHeaders.pending'), align: 'right' },
]);

const rows = computed(() =>
  props.channels.map((channel) => ({
    id: channel.channel,
    channelLabel: t(`campaigns.channels.${channel.channel}`),
    attempted: channel.attempted ?? 0,
    sent: channel.sent ?? 0,
    failed: channel.failed ?? 0,
    skipped: channel.skipped ?? 0,
    pending: channel.pending ?? 0,
  })),
);
</script>

<template>
  <AppTable :columns="columns" :rows="rows" row-key="id" :empty="empty" />
</template>
