export const plans = {
  free: {
    bulkMarkdownImport: false,
    expandedRelatedNotes: false,
  },
  pro: {
    bulkMarkdownImport: true,
    expandedRelatedNotes: true,
  },
} as const;

export type Plan = keyof typeof plans;
