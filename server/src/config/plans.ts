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

export const monthlySemanticSearchAllowances: Record<Plan, number> = {
  free: 100,
  pro: 1000,
};
