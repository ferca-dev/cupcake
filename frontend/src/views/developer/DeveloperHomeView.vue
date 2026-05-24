<script setup>
import { computed, onMounted, ref, watch } from 'vue';

import { useDeveloperStore } from '../../stores/developer.store.js';
import { useI18n } from '../../i18n/index.js';
import {
  AppAlert,
  AppBadge,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppModal,
  AppSelect,
  AppTable,
  AppTextarea,
} from '../../components/ui/index.js';

const store = useDeveloperStore();
const { t } = useI18n();

const tabs = computed(() => [
  { key: 'apiKeys', label: t('developer.tabs.apiKeys') },
  { key: 'webhooks', label: t('developer.tabs.webhooks') },
]);
const activeTab = ref('apiKeys');

// ----------------- API Key form / table -----------------
const API_SCOPES = [
  'surveys:read',
  'surveys:write',
  'responses:read',
  'contacts:read',
  'contacts:write',
  'campaigns:read',
  'campaigns:send',
  'reports:read',
];

const showApiKeyForm = ref(false);
const apiKeyForm = ref({ name: '', description: '', scopes: [], expiresAt: '' });
const apiKeyFormError = ref('');
const apiKeyCopyState = ref('idle');

const resetApiKeyForm = () => {
  apiKeyForm.value = { name: '', description: '', scopes: [], expiresAt: '' };
  apiKeyFormError.value = '';
};

const openApiKeyForm = () => {
  resetApiKeyForm();
  showApiKeyForm.value = true;
};

const submitApiKeyForm = async () => {
  apiKeyFormError.value = '';
  if (!apiKeyForm.value.name.trim()) {
    apiKeyFormError.value = t('developer.apiKeys.errors.nameRequired');
    return;
  }
  if (apiKeyForm.value.scopes.length === 0) {
    apiKeyFormError.value = t('developer.apiKeys.errors.scopesRequired');
    return;
  }
  try {
    await store.createApiKey({
      name: apiKeyForm.value.name.trim(),
      description: apiKeyForm.value.description.trim() || null,
      scopes: [...apiKeyForm.value.scopes],
      expiresAt: apiKeyForm.value.expiresAt
        ? new Date(apiKeyForm.value.expiresAt).toISOString()
        : null,
    });
    showApiKeyForm.value = false;
  } catch (err) {
    apiKeyFormError.value = err?.message ?? '';
  }
};

const onRotateKey = async (row) => {
  if (!window.confirm(t('developer.apiKeys.confirm.rotate'))) return;
  await store.rotateApiKey(row.id);
};

const onRevokeKey = async (row) => {
  if (!window.confirm(t('developer.apiKeys.confirm.revoke'))) return;
  await store.revokeApiKey(row.id);
};

const onDeleteKey = async (row) => {
  if (!window.confirm(t('developer.apiKeys.confirm.delete'))) return;
  await store.deleteApiKey(row.id);
};

const apiKeyColumns = computed(() => [
  { key: 'name', label: t('developer.apiKeys.columns.name') },
  { key: 'prefix', label: t('developer.apiKeys.columns.prefix') },
  { key: 'scopes', label: t('developer.apiKeys.columns.scopes') },
  { key: 'status', label: t('developer.apiKeys.columns.status') },
  { key: 'lastUsedAt', label: t('developer.apiKeys.columns.lastUsed') },
  { key: 'expiresAt', label: t('developer.apiKeys.columns.expires') },
  { key: 'actions', label: t('developer.apiKeys.columns.actions'), align: 'right' },
]);

const copyToClipboard = async (text) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    apiKeyCopyState.value = 'copied';
    setTimeout(() => {
      apiKeyCopyState.value = 'idle';
    }, 1500);
  } catch {
    apiKeyCopyState.value = 'idle';
  }
};

// ----------------- Webhook form / table -----------------
const WEBHOOK_EVENT_TYPES = [
  'response.submitted',
  'campaign.completed',
  'campaign.failed',
  'payment.approved',
  'wallet.low_balance',
  'subscription.failed',
];

const WEBHOOK_STATUSES = ['active', 'paused', 'disabled'];

const showWebhookForm = ref(false);
const webhookFormMode = ref('create');
const webhookForm = ref({
  id: null,
  name: '',
  description: '',
  url: '',
  events: [],
  status: 'active',
  rotateSecret: false,
});
const webhookFormError = ref('');

const webhookSecretCopyState = ref('idle');

const resetWebhookForm = () => {
  webhookForm.value = {
    id: null,
    name: '',
    description: '',
    url: '',
    events: [],
    status: 'active',
    rotateSecret: false,
  };
  webhookFormError.value = '';
};

const openWebhookCreateForm = () => {
  resetWebhookForm();
  webhookFormMode.value = 'create';
  showWebhookForm.value = true;
};

const openWebhookEditForm = (row) => {
  webhookForm.value = {
    id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    url: row.url ?? '',
    events: [...(row.events ?? [])],
    status: row.status ?? 'active',
    rotateSecret: false,
  };
  webhookFormMode.value = 'edit';
  webhookFormError.value = '';
  showWebhookForm.value = true;
};

const submitWebhookForm = async () => {
  webhookFormError.value = '';
  if (!webhookForm.value.name.trim()) {
    webhookFormError.value = t('developer.webhooks.errors.nameRequired');
    return;
  }
  if (!/^https?:\/\//i.test(webhookForm.value.url.trim())) {
    webhookFormError.value = t('developer.webhooks.errors.urlInvalid');
    return;
  }
  if (webhookForm.value.events.length === 0) {
    webhookFormError.value = t('developer.webhooks.errors.eventsRequired');
    return;
  }
  try {
    if (webhookFormMode.value === 'create') {
      await store.createWebhook({
        name: webhookForm.value.name.trim(),
        description: webhookForm.value.description.trim() || null,
        url: webhookForm.value.url.trim(),
        events: [...webhookForm.value.events],
        status: webhookForm.value.status,
      });
    } else {
      await store.updateWebhook(webhookForm.value.id, {
        name: webhookForm.value.name.trim(),
        description: webhookForm.value.description.trim() || null,
        url: webhookForm.value.url.trim(),
        events: [...webhookForm.value.events],
        status: webhookForm.value.status,
        rotateSecret: webhookForm.value.rotateSecret === true,
      });
    }
    showWebhookForm.value = false;
  } catch (err) {
    webhookFormError.value = err?.message ?? '';
  }
};

const onDeleteWebhook = async (row) => {
  if (!window.confirm(t('developer.webhooks.confirm.delete'))) return;
  await store.deleteWebhook(row.id);
};

const onSendTest = async (row) => {
  await store.sendTestEvent(row.id, {});
};

const onViewDeliveries = async (row) => {
  await store.fetchDeliveries(row.id);
};

const webhookColumns = computed(() => [
  { key: 'name', label: t('developer.webhooks.columns.name') },
  { key: 'url', label: t('developer.webhooks.columns.url') },
  { key: 'events', label: t('developer.webhooks.columns.events') },
  { key: 'status', label: t('developer.webhooks.columns.status') },
  { key: 'lastDeliveryAt', label: t('developer.webhooks.columns.lastDelivery') },
  { key: 'actions', label: t('developer.webhooks.columns.actions'), align: 'right' },
]);

const deliveryColumns = computed(() => [
  { key: 'eventType', label: t('developer.webhooks.deliveries.columns.event') },
  { key: 'status', label: t('developer.webhooks.deliveries.columns.status') },
  { key: 'attempts', label: t('developer.webhooks.deliveries.columns.attempts') },
  { key: 'statusCode', label: t('developer.webhooks.deliveries.columns.statusCode') },
  { key: 'createdAt', label: t('developer.webhooks.deliveries.columns.createdAt') },
  { key: 'deliveredAt', label: t('developer.webhooks.deliveries.columns.deliveredAt') },
]);

const inspectedEndpoint = computed(() =>
  store.webhooks.find((w) => w.id === store.inspectedEndpointId),
);

const statusVariant = (status) => {
  if (status === 'active' || status === 'succeeded') return 'success';
  if (status === 'paused' || status === 'pending' || status === 'in_progress') return 'info';
  if (status === 'failed' || status === 'dead_letter' || status === 'revoked' || status === 'disabled')
    return 'danger';
  return 'neutral';
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const copyWebhookSecret = async () => {
  if (!store.lastRevealedWebhookSecret) return;
  try {
    await navigator.clipboard.writeText(store.lastRevealedWebhookSecret);
    webhookSecretCopyState.value = 'copied';
    setTimeout(() => {
      webhookSecretCopyState.value = 'idle';
    }, 1500);
  } catch {
    webhookSecretCopyState.value = 'idle';
  }
};

const refreshActiveTab = async () => {
  if (activeTab.value === 'apiKeys') {
    await store.fetchApiKeys();
  } else {
    await store.fetchWebhooks();
  }
};

onMounted(async () => {
  store.clearRevealedSecrets();
  await store.fetchApiKeys();
  await store.fetchWebhooks();
});

watch(activeTab, () => {
  store.resetMessages();
});
</script>

<template>
  <section class="developer-page page-container">
    <header class="developer-page__header">
      <div>
        <h1>{{ t('developer.title') }}</h1>
        <p class="developer-page__subtitle">{{ t('developer.subtitle') }}</p>
      </div>
      <AppButton variant="ghost" size="sm" @click="refreshActiveTab">
        {{ t('common.refresh') }}
      </AppButton>
    </header>

    <nav class="developer-page__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="developer-page__tab"
        :class="{ 'is-active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <AppAlert v-if="store.lastError" variant="error">{{ store.lastError }}</AppAlert>
    <AppAlert v-if="store.lastSuccess === 'test_event_failed'" variant="warning">
      {{ t('developer.webhooks.test.failure') }}
    </AppAlert>
    <AppAlert v-if="store.lastSuccess === 'test_event_delivered'" variant="success">
      {{ t('developer.webhooks.test.success') }}
    </AppAlert>

    <!-- API KEYS TAB -->
    <section v-if="activeTab === 'apiKeys'" class="developer-page__section">
      <AppCard padded>
        <template #title>{{ t('developer.apiKeys.title') }}</template>
        <p class="developer-page__section-subtitle">{{ t('developer.apiKeys.subtitle') }}</p>
        <div class="developer-page__toolbar">
          <AppButton @click="openApiKeyForm">{{ t('developer.apiKeys.newKey') }}</AppButton>
        </div>

        <AppLoader v-if="store.isLoadingApiKeys && store.apiKeys.length === 0" />
        <AppTable
          v-else
          :columns="apiKeyColumns"
          :rows="store.apiKeys"
          row-key="id"
          :empty="t('developer.apiKeys.empty')"
        >
          <template #cell:scopes="{ row }">
            <div class="developer-page__chips">
              <AppBadge v-for="scope in row.scopes" :key="scope" variant="neutral">
                {{ scope }}
              </AppBadge>
            </div>
          </template>
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">
              {{ t(`developer.apiKeys.status.${row.status}`) }}
            </AppBadge>
          </template>
          <template #cell:lastUsedAt="{ row }">{{ formatDate(row.lastUsedAt) }}</template>
          <template #cell:expiresAt="{ row }">{{ formatDate(row.expiresAt) }}</template>
          <template #cell:actions="{ row }">
            <div class="developer-page__row-actions">
              <AppButton
                v-if="row.status === 'active'"
                size="sm"
                variant="secondary"
                @click="onRotateKey(row)"
              >
                {{ t('developer.apiKeys.actions.rotate') }}
              </AppButton>
              <AppButton
                v-if="row.status === 'active'"
                size="sm"
                variant="ghost"
                @click="onRevokeKey(row)"
              >
                {{ t('developer.apiKeys.actions.revoke') }}
              </AppButton>
              <AppButton size="sm" variant="danger" @click="onDeleteKey(row)">
                {{ t('developer.apiKeys.actions.delete') }}
              </AppButton>
            </div>
          </template>
        </AppTable>
      </AppCard>
    </section>

    <!-- WEBHOOKS TAB -->
    <section v-else class="developer-page__section">
      <AppCard padded>
        <template #title>{{ t('developer.webhooks.title') }}</template>
        <p class="developer-page__section-subtitle">{{ t('developer.webhooks.subtitle') }}</p>
        <div class="developer-page__toolbar">
          <AppButton @click="openWebhookCreateForm">{{ t('developer.webhooks.newEndpoint') }}</AppButton>
        </div>

        <AppLoader v-if="store.isLoadingWebhooks && store.webhooks.length === 0" />
        <AppTable
          v-else
          :columns="webhookColumns"
          :rows="store.webhooks"
          row-key="id"
          :empty="t('developer.webhooks.empty')"
        >
          <template #cell:url="{ row }">
            <code class="developer-page__url">{{ row.url }}</code>
          </template>
          <template #cell:events="{ row }">
            <div class="developer-page__chips">
              <AppBadge v-for="event in row.events" :key="event" variant="neutral">
                {{ event }}
              </AppBadge>
            </div>
          </template>
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">
              {{ t(`developer.webhooks.status.${row.status}`) }}
            </AppBadge>
          </template>
          <template #cell:lastDeliveryAt="{ row }">{{ formatDate(row.lastDeliveryAt) }}</template>
          <template #cell:actions="{ row }">
            <div class="developer-page__row-actions">
              <AppButton size="sm" variant="ghost" @click="openWebhookEditForm(row)">
                {{ t('developer.webhooks.actions.edit') }}
              </AppButton>
              <AppButton
                size="sm"
                variant="secondary"
                :disabled="row.status !== 'active'"
                @click="onSendTest(row)"
              >
                {{ t('developer.webhooks.actions.test') }}
              </AppButton>
              <AppButton size="sm" variant="ghost" @click="onViewDeliveries(row)">
                {{ t('developer.webhooks.actions.deliveries') }}
              </AppButton>
              <AppButton size="sm" variant="danger" @click="onDeleteWebhook(row)">
                {{ t('developer.webhooks.actions.delete') }}
              </AppButton>
            </div>
          </template>
        </AppTable>
      </AppCard>

      <AppCard v-if="inspectedEndpoint" padded>
        <template #title>
          {{ t('developer.webhooks.deliveries.title') }} — {{ inspectedEndpoint.name }}
        </template>
        <AppLoader v-if="store.isLoadingDeliveries" />
        <AppTable
          v-else
          :columns="deliveryColumns"
          :rows="store.deliveries"
          row-key="id"
          :empty="t('developer.webhooks.deliveries.none')"
        >
          <template #cell:status="{ row }">
            <AppBadge :variant="statusVariant(row.status)">{{ row.status }}</AppBadge>
          </template>
          <template #cell:statusCode="{ row }">
            {{ row.lastAttempt?.statusCode ?? '—' }}
          </template>
          <template #cell:createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
          <template #cell:deliveredAt="{ row }">{{ formatDate(row.deliveredAt) }}</template>
        </AppTable>
      </AppCard>
    </section>

    <!-- Modal: API key form -->
    <AppModal
      v-model="showApiKeyForm"
      :title="t('developer.apiKeys.formTitle')"
      @close="resetApiKeyForm"
    >
      <form class="developer-form" @submit.prevent="submitApiKeyForm">
        <AppInput
          v-model="apiKeyForm.name"
          :label="t('developer.apiKeys.nameField')"
          :hint="t('developer.apiKeys.nameHint')"
          required
        />
        <AppTextarea
          v-model="apiKeyForm.description"
          :label="t('developer.apiKeys.descriptionField')"
          :rows="2"
        />
        <fieldset class="developer-form__fieldset">
          <legend>{{ t('developer.apiKeys.scopesField') }}</legend>
          <div class="developer-form__checkbox-grid">
            <label v-for="scope in API_SCOPES" :key="scope" class="developer-form__checkbox">
              <input v-model="apiKeyForm.scopes" type="checkbox" :value="scope" />
              <span>{{ scope }}</span>
            </label>
          </div>
        </fieldset>
        <AppInput
          v-model="apiKeyForm.expiresAt"
          type="datetime-local"
          :label="t('developer.apiKeys.expiresField')"
          :hint="t('developer.apiKeys.expiresHint')"
        />
        <AppAlert v-if="apiKeyFormError" variant="error">{{ apiKeyFormError }}</AppAlert>
        <div class="developer-form__actions">
          <AppButton type="button" variant="ghost" @click="showApiKeyForm = false">
            {{ t('common.cancel') }}
          </AppButton>
          <AppButton type="submit" :loading="store.isMutating">
            {{ t('developer.apiKeys.create') }}
          </AppButton>
        </div>
      </form>
    </AppModal>

    <!-- Modal: reveal API key once -->
    <AppModal
      :model-value="!!store.lastRevealedApiKey"
      :title="t('developer.apiKeys.reveal.title')"
      :close-on-backdrop="false"
      @close="store.clearRevealedSecrets()"
    >
      <p>{{ t('developer.apiKeys.reveal.body') }}</p>
      <pre class="developer-secret">{{ store.lastRevealedApiKey?.rawKey ?? '' }}</pre>
      <div class="developer-form__actions">
        <AppButton variant="secondary" @click="copyToClipboard(store.lastRevealedApiKey?.rawKey)">
          {{
            apiKeyCopyState === 'copied'
              ? t('developer.apiKeys.reveal.copied')
              : t('developer.apiKeys.reveal.copy')
          }}
        </AppButton>
        <AppButton @click="store.clearRevealedSecrets()">
          {{ t('developer.apiKeys.reveal.done') }}
        </AppButton>
      </div>
    </AppModal>

    <!-- Modal: webhook form -->
    <AppModal
      v-model="showWebhookForm"
      :title="
        webhookFormMode === 'create'
          ? t('developer.webhooks.formTitle')
          : t('developer.webhooks.editTitle')
      "
      size="lg"
      @close="resetWebhookForm"
    >
      <form class="developer-form" @submit.prevent="submitWebhookForm">
        <AppInput
          v-model="webhookForm.name"
          :label="t('developer.webhooks.nameField')"
          required
        />
        <AppInput
          v-model="webhookForm.url"
          :label="t('developer.webhooks.urlField')"
          type="url"
          placeholder="https://example.com/webhooks/cupcake"
          required
        />
        <AppTextarea
          v-model="webhookForm.description"
          :label="t('developer.webhooks.descriptionField')"
          :rows="2"
        />
        <fieldset class="developer-form__fieldset">
          <legend>{{ t('developer.webhooks.eventsField') }}</legend>
          <div class="developer-form__checkbox-grid">
            <label v-for="event in WEBHOOK_EVENT_TYPES" :key="event" class="developer-form__checkbox">
              <input v-model="webhookForm.events" type="checkbox" :value="event" />
              <span>{{ event }}</span>
            </label>
          </div>
        </fieldset>
        <AppSelect
          v-model="webhookForm.status"
          :options="WEBHOOK_STATUSES.map((s) => ({ value: s, label: t(`developer.webhooks.status.${s}`) }))"
          :label="t('developer.webhooks.columns.status')"
        />
        <label v-if="webhookFormMode === 'edit'" class="developer-form__checkbox">
          <input v-model="webhookForm.rotateSecret" type="checkbox" />
          <span>{{ t('developer.webhooks.rotateSecret') }}</span>
        </label>
        <AppAlert v-if="webhookFormError" variant="error">{{ webhookFormError }}</AppAlert>
        <div class="developer-form__actions">
          <AppButton type="button" variant="ghost" @click="showWebhookForm = false">
            {{ t('common.cancel') }}
          </AppButton>
          <AppButton type="submit" :loading="store.isMutating">
            {{
              webhookFormMode === 'create'
                ? t('developer.webhooks.create')
                : t('common.save')
            }}
          </AppButton>
        </div>
      </form>
    </AppModal>

    <!-- Modal: reveal webhook secret once -->
    <AppModal
      :model-value="!!store.lastRevealedWebhookSecret"
      :title="t('developer.webhooks.reveal.title')"
      :close-on-backdrop="false"
      @close="store.clearRevealedSecrets()"
    >
      <p>
        {{
          t('developer.webhooks.reveal.body', { header: 'X-Cupcake-Signature' })
        }}
      </p>
      <pre class="developer-secret">{{ store.lastRevealedWebhookSecret }}</pre>
      <div class="developer-form__actions">
        <AppButton variant="secondary" @click="copyWebhookSecret">
          {{
            webhookSecretCopyState === 'copied'
              ? t('developer.apiKeys.reveal.copied')
              : t('developer.webhooks.reveal.copy')
          }}
        </AppButton>
        <AppButton @click="store.clearRevealedSecrets()">
          {{ t('developer.webhooks.reveal.done') }}
        </AppButton>
      </div>
    </AppModal>
  </section>
</template>

<style scoped>
.developer-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.developer-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.developer-page__subtitle {
  color: var(--color-text-muted);
  max-width: 60ch;
}

.developer-page__tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--color-border);
}

.developer-page__tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.6rem 0.9rem;
  cursor: pointer;
  color: var(--color-text-muted);
  font: inherit;
}

.developer-page__tab.is-active {
  color: var(--color-text);
  border-bottom-color: var(--color-primary);
}

.developer-page__section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.developer-page__section-subtitle {
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
}

.developer-page__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.75rem;
}

.developer-page__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.developer-page__url {
  font-size: 0.85rem;
  word-break: break-all;
}

.developer-page__row-actions {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
}

.developer-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.developer-form__fieldset {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.75rem 0.9rem;
}

.developer-form__fieldset legend {
  padding: 0 0.4rem;
  font-weight: 600;
}

.developer-form__checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.4rem 0.75rem;
}

.developer-form__checkbox {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}

.developer-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.developer-secret {
  background: var(--color-surface-alt);
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
  font-size: 0.9rem;
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
