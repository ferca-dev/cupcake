<script setup>
// Create/edit modal for a single contact. Owns the input draft locally and
// emits `submit` with a normalised payload; the parent decides whether to
// call create or update.
import { computed, ref, watch } from 'vue';

import { useI18n } from '../../i18n/index.js';
import { AppAlert, AppButton, AppInput, AppModal, AppSelect } from '../../components/ui/index.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  contact: { type: Object, default: null },
  availableGroups: { type: Array, default: () => [] },
  isSubmitting: { type: Boolean, default: false },
  serverError: { type: String, default: '' },
  serverDetails: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'submit', 'close']);

const { t } = useI18n();

const blankDraft = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  whatsappPhone: '',
  tagsInput: '',
  groupIds: [],
  consent: {
    email: 'subscribed',
    sms: 'subscribed',
    whatsapp: 'subscribed',
  },
  status: 'active',
});

const draft = ref(blankDraft());
const localError = ref('');

const hydrate = (source) => {
  if (!source) {
    draft.value = blankDraft();
    localError.value = '';
    return;
  }
  draft.value = {
    firstName: source.firstName ?? '',
    lastName: source.lastName ?? '',
    email: source.email ?? '',
    phone: source.phone ?? '',
    whatsappPhone: source.whatsappPhone ?? '',
    tagsInput: (source.tags ?? []).join(', '),
    groupIds: [...(source.groupIds ?? [])],
    consent: {
      email: source.consent?.email?.status ?? 'subscribed',
      sms: source.consent?.sms?.status ?? 'subscribed',
      whatsapp: source.consent?.whatsapp?.status ?? 'subscribed',
    },
    status: source.status ?? 'active',
  };
  localError.value = '';
};

watch(
  () => [props.modelValue, props.contact],
  ([open, contact]) => {
    if (open) hydrate(contact);
  },
  { immediate: true },
);

const isEditing = computed(() => Boolean(props.contact?.id));

const statusOptions = [
  { value: 'active', label: t('contacts.modal.status.active') },
  { value: 'archived', label: t('contacts.modal.status.archived') },
  { value: 'blocked', label: t('contacts.modal.status.blocked') },
];

const consentOptions = [
  { value: 'subscribed', label: t('contacts.consent.statuses.subscribed') },
  { value: 'pending', label: t('contacts.consent.statuses.pending') },
  { value: 'unknown', label: t('contacts.consent.statuses.unknown') },
  { value: 'unsubscribed', label: t('contacts.consent.statuses.unsubscribed') },
];

const close = () => {
  if (props.isSubmitting) return;
  emit('update:modelValue', false);
  emit('close');
};

const parseTags = () =>
  draft.value.tagsInput
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const submit = () => {
  const tags = parseTags();
  const payload = {
    firstName: draft.value.firstName.trim() || null,
    lastName: draft.value.lastName.trim() || null,
    email: draft.value.email.trim() || null,
    phone: draft.value.phone.trim() || null,
    whatsappPhone: draft.value.whatsappPhone.trim() || null,
    tags,
    groupIds: draft.value.groupIds,
    consent: {
      email: { status: draft.value.consent.email, source: 'manual' },
      sms: { status: draft.value.consent.sms, source: 'manual' },
      whatsapp: { status: draft.value.consent.whatsapp, source: 'manual' },
    },
    status: draft.value.status,
  };
  const hasChannel = payload.email || payload.phone || payload.whatsappPhone;
  if (!hasChannel) {
    localError.value = t('contacts.modal.errors.channelRequired');
    return;
  }
  localError.value = '';
  emit('submit', payload);
};

const toggleGroup = (groupId) => {
  const current = new Set(draft.value.groupIds);
  if (current.has(groupId)) {
    current.delete(groupId);
  } else {
    current.add(groupId);
  }
  draft.value.groupIds = [...current];
};

const isGroupSelected = (groupId) => draft.value.groupIds.includes(groupId);
</script>

<template>
  <AppModal
    :model-value="modelValue"
    :title="isEditing ? t('contacts.modal.editTitle') : t('contacts.modal.createTitle')"
    size="lg"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @close="close"
  >
    <div class="contact-form">
      <AppAlert v-if="localError" variant="error">{{ localError }}</AppAlert>
      <AppAlert v-if="serverError" variant="error">
        {{ serverError }}
        <ul v-if="serverDetails && serverDetails.length" class="contact-form__details">
          <li v-for="(detail, idx) in serverDetails" :key="idx">{{ detail }}</li>
        </ul>
      </AppAlert>

      <div class="contact-form__row">
        <AppInput v-model="draft.firstName" :label="t('contacts.modal.firstName')" />
        <AppInput v-model="draft.lastName" :label="t('contacts.modal.lastName')" />
      </div>

      <AppInput
        v-model="draft.email"
        type="email"
        :label="t('contacts.modal.email')"
        :hint="t('contacts.modal.emailHint')"
      />
      <div class="contact-form__row">
        <AppInput
          v-model="draft.phone"
          :label="t('contacts.modal.phone')"
          :hint="t('contacts.modal.phoneHint')"
        />
        <AppInput
          v-model="draft.whatsappPhone"
          :label="t('contacts.modal.whatsapp')"
          :hint="t('contacts.modal.phoneHint')"
        />
      </div>

      <AppInput
        v-model="draft.tagsInput"
        :label="t('contacts.modal.tags')"
        :hint="t('contacts.modal.tagsHint')"
      />

      <AppSelect
        v-model="draft.status"
        :options="statusOptions"
        :label="t('contacts.modal.statusLabel')"
      />

      <fieldset class="contact-form__groups">
        <legend>{{ t('contacts.consent.title') }}</legend>
        <div class="contact-form__row">
          <AppSelect
            v-model="draft.consent.email"
            :options="consentOptions"
            :label="t('contacts.consent.email')"
          />
          <AppSelect
            v-model="draft.consent.sms"
            :options="consentOptions"
            :label="t('contacts.consent.sms')"
          />
        </div>
        <AppSelect
          v-model="draft.consent.whatsapp"
          :options="consentOptions"
          :label="t('contacts.consent.whatsapp')"
        />
      </fieldset>

      <fieldset class="contact-form__groups">
        <legend>{{ t('contacts.modal.groups') }}</legend>
        <p v-if="!availableGroups.length" class="contact-form__hint">
          {{ t('contacts.modal.noGroups') }}
        </p>
        <label v-for="group in availableGroups" :key="group.id" class="contact-form__checkbox">
          <input
            type="checkbox"
            :checked="isGroupSelected(group.id)"
            :value="group.id"
            @change="toggleGroup(group.id)"
          />
          <span>{{ group.name }}</span>
        </label>
      </fieldset>
    </div>

    <template #footer>
      <AppButton variant="ghost" :disabled="isSubmitting" @click="close">
        {{ t('common.cancel') }}
      </AppButton>
      <AppButton :loading="isSubmitting" @click="submit">
        {{ isEditing ? t('common.save') : t('contacts.modal.create') }}
      </AppButton>
    </template>
  </AppModal>
</template>

<style scoped>
.contact-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.contact-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

@media (max-width: 600px) {
  .contact-form__row {
    grid-template-columns: 1fr;
  }
}

.contact-form__groups {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.contact-form__groups legend {
  padding: 0 var(--space-1);
  font-weight: 500;
  font-size: var(--font-size-sm);
}

.contact-form__checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.contact-form__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.contact-form__details {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-4);
}
</style>
