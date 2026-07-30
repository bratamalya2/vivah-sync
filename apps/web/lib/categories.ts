export const VENDOR_CATEGORIES: { value: string; label: string }[] = [
  { value: 'PHOTOGRAPHY', label: 'Photography' },
  { value: 'VIDEOGRAPHY', label: 'Videography' },
  { value: 'CATERING', label: 'Catering' },
  { value: 'DECOR', label: 'Décor' },
  { value: 'MUSIC_DJ', label: 'Music / DJ' },
  { value: 'MAKEUP', label: 'Makeup' },
  { value: 'MEHNDI', label: 'Mehndi' },
  { value: 'PRIEST_PANDIT', label: 'Priest / Pandit' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'LIGHTING', label: 'Lighting' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'OTHER', label: 'Other' },
]

export function categoryLabel(value: string): string {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.label ?? value
}
