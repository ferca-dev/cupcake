// Custom choice text is kept alongside the selected key(s) in renderer state.
// API answers keep their original scalar/array value for logic and statistics.
export const choiceValue = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) && 'selected' in value
    ? value.selected
    : value;

export const selectedOtherOption = (field, value) => {
  const selected = choiceValue(value);
  return (field.options ?? []).find(
    (option) =>
      option.isOther &&
      (Array.isArray(selected) ? selected.includes(option.key) : selected === option.key),
  );
};

export const fixedImageOptions = (field, t) => {
  if (field.type === 'yes_no')
    return [
      { key: 'true', label: t('publicForm.yes') },
      { key: 'false', label: t('publicForm.no') },
    ];
  if (field.type === 'checkbox') return [{ key: 'true', label: field.label }];
  if (field.type === 'rating' || field.type === 'nps') {
    const min = field.type === 'nps' ? 0 : (field.validation?.min ?? 1);
    const max = field.type === 'nps' ? 10 : (field.validation?.max ?? 5);
    return Array.from(
      { length: Math.min(101, Math.max(0, Math.floor(max - min + 1))) },
      (_, index) => ({ key: String(min + index), label: String(min + index) }),
    );
  }
  return [];
};
