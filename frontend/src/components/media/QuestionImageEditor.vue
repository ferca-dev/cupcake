<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { mediaService } from '../../services/media.service.js';
import { useI18n } from '../../i18n/index.js';
import { AppInput, AppButton } from '../ui/index.js';
import QuestionImage from './QuestionImage.vue';

const props = defineProps({
  image: { type: Object, default: () => ({}) },
  label: { type: String, default: '' },
});
const emit = defineEmits(['update']);
const { t } = useI18n();
const input = ref(null);
const uploading = ref(false);
const error = ref('');
let active = true;
// An upload must never attach to a different question if the inspector selection changes.
onBeforeUnmount(() => {
  active = false;
});
const upload = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  uploading.value = true;
  error.value = '';
  try {
    const { asset } = await mediaService.uploadImage({ file, purpose: 'survey_image' });
    if (active) emit('update', { imageUrl: asset.publicUrl || asset.url, mediaAssetId: asset.id });
  } catch (err) {
    if (active) error.value = err?.message || t('builder.inspector.fields.imageUploadError');
  } finally {
    uploading.value = false;
    event.target.value = '';
  }
};
</script>

<template>
  <div class="question-image-editor">
    <AppInput
      :model-value="props.image.imageUrl ?? ''"
      :label="label || t('builder.inspector.fields.imageUrl')"
      :disabled="uploading"
      @update:model-value="(imageUrl) => emit('update', { imageUrl, mediaAssetId: null })"
    />
    <div class="question-image-editor__actions">
      <input
        ref="input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        @change="upload"
      />
      <AppButton size="sm" variant="secondary" :loading="uploading" @click="input.click()">{{
        t('builder.inspector.fields.uploadImage')
      }}</AppButton>
      <AppButton
        v-if="image.imageUrl"
        size="sm"
        variant="ghost"
        :disabled="uploading"
        @click="emit('update', { imageUrl: null, mediaAssetId: null })"
        >{{ t('builder.inspector.fields.clearImage') }}</AppButton
      >
      <QuestionImage :src="image.imageUrl" :label="label" />
    </div>
    <small v-if="error" role="alert">{{ error }}</small>
  </div>
</template>

<style scoped>
.question-image-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.question-image-editor__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}
.question-image-editor small {
  color: var(--color-danger-600);
}
</style>
