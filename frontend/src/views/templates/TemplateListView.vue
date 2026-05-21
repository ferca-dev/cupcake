<script setup>
// Templates list view. Renders the active system templates plus the caller
// tenant's templates as a grid of cards. Clicking "Use" instantiates a draft
// survey and routes the user into the builder. Tenant admins with the
// templates.manage permission can also create/edit/delete their own templates.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useTemplatesStore } from '../../stores/templates.store.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useI18n } from '../../i18n/index.js';
import TemplateCard from '../../features/templates/TemplateCard.vue';
import {
  AppAlert,
  AppButton,
  AppCard,
  AppInput,
  AppLoader,
  AppModal,
  AppSelect,
  AppTextarea,
} from '../../components/ui/index.js';

const router = useRouter();
const templatesStore = useTemplatesStore();
const auth = useAuthStore();
const { t } = useI18n();

const items = computed(() => templatesStore.items);
const isLoading = computed(() => templatesStore.isLoading);
const isMutating = computed(() => templatesStore.isMutating);
const loadError = computed(() => templatesStore.lastError);

const canManage = computed(() => auth.hasPermission('templates.manage'));
const canCreateSurvey = computed(() => auth.hasPermission('surveys.create'));
const isSuperAdmin = computed(() => auth.isSuperAdmin);

const search = ref('');
const categoryFilter = ref('');
const scopeFilter = ref('all');

const useDialogOpen = ref(false);
const useTarget = ref(null);
const useDraft = ref({ title: '', slug: '' });
const useError = ref(null);

const editDialogOpen = ref(false);
const editTarget = ref(null);
const editDraft = ref({ title: '', description: '', category: 'other', status: 'active' });
const editError = ref(null);

const deleteTarget = ref(null);

const filteredItems = computed(() => {
  let list = items.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter((tpl) => tpl.title.toLowerCase().includes(q));
  }
  if (categoryFilter.value) {
    list = list.filter((tpl) => tpl.category === categoryFilter.value);
  }
  if (scopeFilter.value === 'system') {
    list = list.filter((tpl) => tpl.isSystemTemplate);
  } else if (scopeFilter.value === 'tenant') {
    list = list.filter((tpl) => !tpl.isSystemTemplate);
  }
  return list;
});

const categories = [
  'customer_satisfaction',
  'employee_feedback',
  'event_registration',
  'product_feedback',
  'nps',
  'contact_info',
  'post_service',
  'lead_capture',
  'other',
];

const categoryOptions = computed(() => [
  { value: '', label: t('templates.filters.allCategories') },
  ...categories.map((value) => ({ value, label: t(`templates.categories.${value}`) })),
]);

const scopeOptions = computed(() => [
  { value: 'all', label: t('templates.filters.scopeAll') },
  { value: 'system', label: t('templates.filters.scopeSystem') },
  { value: 'tenant', label: t('templates.filters.scopeTenant') },
]);

const statusOptions = computed(() => [
  { value: 'active', label: t('templates.status.active') },
  { value: 'inactive', label: t('templates.status.inactive') },
]);

const canEdit = (template) => {
  if (!canManage.value) return false;
  if (template.isSystemTemplate) return isSuperAdmin.value;
  return true;
};

const refresh = async () => {
  try {
    await templatesStore.fetchTemplates({ limit: 100 });
  } catch {
    // store.lastError surfaces the message via the alert below.
  }
};

onMounted(refresh);

const openUse = (template) => {
  useTarget.value = template;
  useDraft.value = { title: template.title, slug: '' };
  useError.value = null;
  useDialogOpen.value = true;
};

const submitUse = async () => {
  if (!useTarget.value) return;
  useError.value = null;
  try {
    const survey = await templatesStore.createSurveyFromTemplate(useTarget.value.id, {
      title: useDraft.value.title.trim() || undefined,
      slug: useDraft.value.slug.trim() || undefined,
    });
    useDialogOpen.value = false;
    if (survey?.id) {
      router.push({ name: 'surveys.builder', params: { id: survey.id } });
    }
  } catch (err) {
    useError.value = err?.message ?? t('templates.errors.createSurveyFailed');
  }
};

const openCreate = () => {
  editTarget.value = null;
  editDraft.value = { title: '', description: '', category: 'other', status: 'active' };
  editError.value = null;
  editDialogOpen.value = true;
};

const openEdit = (template) => {
  editTarget.value = template;
  editDraft.value = {
    title: template.title,
    description: template.description ?? '',
    category: template.category,
    status: template.status,
  };
  editError.value = null;
  editDialogOpen.value = true;
};

const submitEdit = async () => {
  editError.value = null;
  if (!editDraft.value.title.trim()) {
    editError.value = t('templates.errors.titleRequired');
    return;
  }
  try {
    if (editTarget.value) {
      await templatesStore.updateTemplate(editTarget.value.id, {
        title: editDraft.value.title.trim(),
        description: editDraft.value.description.trim(),
        category: editDraft.value.category,
        status: editDraft.value.status,
      });
    } else {
      // For new templates we duplicate a known empty schema. The full builder
      // editing happens through the survey builder once the template is
      // created; on the listing page we focus on metadata.
      await templatesStore.createTemplate({
        title: editDraft.value.title.trim(),
        description: editDraft.value.description.trim(),
        category: editDraft.value.category,
        status: editDraft.value.status,
        schema: {
          fields: [
            {
              id: 'field_intro',
              type: 'text_block',
              label: 'Introduction',
              required: false,
              order: 1,
              sectionId: null,
              options: [],
              validation: { minLength: null, maxLength: null, min: null, max: null, regex: null },
              visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
              settings: { width: 'full', imageUrl: null },
            },
          ],
          sections: [],
          logicRules: [],
          layout: { mode: 'single_page', showProgress: true },
        },
      });
    }
    editDialogOpen.value = false;
  } catch (err) {
    editError.value = err?.message ?? t('templates.errors.saveFailed');
  }
};

const confirmDelete = async (template) => {
  if (!template) return;
  const confirmed = typeof window !== 'undefined'
    ? window.confirm(t('templates.confirmDelete', { title: template.title }))
    : true;
  if (!confirmed) return;
  deleteTarget.value = template;
  try {
    await templatesStore.deleteTemplate(template.id);
  } finally {
    deleteTarget.value = null;
  }
};
</script>

<template>
  <section class="templates-list">
    <header class="templates-list__header">
      <div>
        <h2>{{ t('templates.list.title') }}</h2>
        <p>{{ t('templates.list.subtitle') }}</p>
      </div>
      <AppButton v-if="canManage" @click="openCreate">
        {{ t('templates.list.newTemplate') }}
      </AppButton>
    </header>

    <AppAlert v-if="loadError" variant="error">{{ loadError }}</AppAlert>

    <AppCard padded class="templates-list__filters">
      <div class="templates-list__filters-row">
        <AppInput
          v-model="search"
          :label="t('common.search')"
          :placeholder="t('templates.filters.searchPlaceholder')"
        />
        <AppSelect
          v-model="categoryFilter"
          :label="t('templates.filters.category')"
          :options="categoryOptions"
        />
        <AppSelect
          v-model="scopeFilter"
          :label="t('templates.filters.scope')"
          :options="scopeOptions"
        />
      </div>
    </AppCard>

    <AppLoader v-if="isLoading && items.length === 0" />

    <p v-else-if="filteredItems.length === 0" class="templates-list__empty">
      {{ t('templates.list.empty') }}
    </p>

    <div v-else class="templates-list__grid">
      <TemplateCard
        v-for="template in filteredItems"
        :key="template.id"
        :template="template"
        :can-edit="canEdit(template)"
        :can-use="canCreateSurvey"
        @use="openUse"
        @edit="openEdit"
        @delete="confirmDelete"
      />
    </div>

    <AppModal
      v-model="useDialogOpen"
      :title="t('templates.useModal.title')"
      @close="useDialogOpen = false"
    >
      <div class="templates-list__modal-body">
        <AppAlert v-if="useError" variant="error">{{ useError }}</AppAlert>
        <p class="templates-list__hint">{{ t('templates.useModal.subtitle') }}</p>
        <AppInput
          v-model="useDraft.title"
          :label="t('templates.useModal.titleField')"
          :hint="t('templates.useModal.titleHint')"
        />
        <AppInput
          v-model="useDraft.slug"
          :label="t('templates.useModal.slugField')"
          :hint="t('templates.useModal.slugHint')"
        />
      </div>
      <template #footer>
        <AppButton variant="ghost" :disabled="isMutating" @click="useDialogOpen = false">
          {{ t('common.cancel') }}
        </AppButton>
        <AppButton :loading="isMutating" @click="submitUse">
          {{ t('templates.useModal.submit') }}
        </AppButton>
      </template>
    </AppModal>

    <AppModal
      v-model="editDialogOpen"
      :title="editTarget ? t('templates.editModal.editTitle') : t('templates.editModal.createTitle')"
      @close="editDialogOpen = false"
    >
      <div class="templates-list__modal-body">
        <AppAlert v-if="editError" variant="error">{{ editError }}</AppAlert>
        <AppInput
          v-model="editDraft.title"
          :label="t('templates.editModal.titleField')"
          required
        />
        <AppTextarea
          v-model="editDraft.description"
          :label="t('templates.editModal.descriptionField')"
          :rows="3"
        />
        <AppSelect
          v-model="editDraft.category"
          :label="t('templates.editModal.categoryField')"
          :options="categoryOptions.filter((option) => option.value !== '')"
        />
        <AppSelect
          v-model="editDraft.status"
          :label="t('templates.editModal.statusField')"
          :options="statusOptions"
        />
        <p v-if="!editTarget" class="templates-list__hint">
          {{ t('templates.editModal.afterCreateHint') }}
        </p>
      </div>
      <template #footer>
        <AppButton variant="ghost" :disabled="isMutating" @click="editDialogOpen = false">
          {{ t('common.cancel') }}
        </AppButton>
        <AppButton :loading="isMutating" @click="submitEdit">
          {{ t('templates.editModal.submit') }}
        </AppButton>
      </template>
    </AppModal>
  </section>
</template>

<style scoped>
.templates-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.templates-list__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}

.templates-list__header h2 {
  margin: 0;
}

.templates-list__header p {
  margin: 0;
  color: var(--color-text-muted);
}

.templates-list__filters-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.templates-list__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: var(--space-4);
}

.templates-list__empty {
  color: var(--color-text-muted);
}

.templates-list__modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.templates-list__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

@media (max-width: 720px) {
  .templates-list__filters-row {
    grid-template-columns: 1fr;
  }
}
</style>
