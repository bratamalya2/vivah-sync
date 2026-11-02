import type { InputHTMLAttributes } from 'react'

/**
 * Tall input with its label set inside on the right; the label fades once the
 * field has a value (pure CSS via :placeholder-shown, so it also handles
 * autofill). It fades by opacity — never display:none — so the input keeps its
 * accessible name.
 */
export default function AuthField({
  label,
  ...input
}: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder'>) {
  return (
    <label className="au-field">
      <input {...input} placeholder=" " />
      <span className="au-field-label">{label}</span>
    </label>
  )
}
