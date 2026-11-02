export const STORAGE_KEY = 'bottledesk:v1'
export const DATA_VERSION = 1

// Older versions used these names; saved data is renamed automatically.
export const LEGACY_TYPE_NAMES = { 'Clear PET': 'Clear', 'Coloured PET': 'Coloured' }

export const DEFAULT_BOTTLE_TYPES = ['Clear', 'Coloured', 'Mixed']

export const EXPENSE_CATEGORIES = [
  'Transport',
  'Labour',
  'Fuel',
  'Sorting & washing',
  'Rent & storage',
  'Packaging',
  'Utilities',
  'Other',
]

export const ADJUSTMENT_REASONS = [
  'Moisture / dirt loss',
  'Rejected / unsellable',
  'Spoiled or damaged',
  'Missing / stolen',
  'Other',
]

export const emptyData = () => ({
  version: DATA_VERSION,
  settings: {
    businessName: 'My Bottle Business',
    ownerName: '',
    defaultBuyPrice: 200,
    openingCash: 0,
    lowStockKg: 100,
    bottleTypes: [...DEFAULT_BOTTLE_TYPES],
  },
  suppliers: [],
  buyers: [],
  purchases: [],
  sales: [],
  payments: [],
  expenses: [],
  adjustments: [],
})
