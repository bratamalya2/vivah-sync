import { getUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// AI-powered contract extraction (PDF -> structured form data). Extracts the PDF
// text (unpdf, no native deps) then asks OpenAI for a strict JSON shape. Degrades
// gracefully: without OPENAI_API_KEY the planner just fills the form manually.

interface Extracted {
  title?: string
  total?: number
  milestones?: { label: string; amount: number; dueDate: string | null }[]
  error?: string
}

async function extractWithOpenAI(text: string): Promise<Extracted> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { error: 'AI extraction isn’t configured — add OPENAI_API_KEY to enable it. You can still fill the form manually.' }

  const system = [
    'You extract a vendor contract for an Indian wedding-planning app. Return STRICT JSON only, shaped:',
    '{ "title": string, "total": number, "milestones": [ { "label": string, "amount": number, "dueDate": string|null } ] }',
    'Amounts are Indian rupees as plain numbers (no symbols or commas). dueDate is "YYYY-MM-DD" or null.',
    'Milestone amounts should sum to the total where the document supports it. Omit title/total if genuinely unknown; use null for an unknown dueDate. Return ONLY the JSON object.',
  ].join(' ')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Contract text:\n\n${text.slice(0, 12000)}` },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { error: `OpenAI request failed (${res.status}). ${t.slice(0, 160)}` }
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return { error: 'OpenAI returned no content.' }
    const parsed = JSON.parse(content)
    const milestones = Array.isArray(parsed.milestones)
      ? parsed.milestones
          .map((m: { label?: unknown; amount?: unknown; dueDate?: unknown }) => ({
            label: String(m.label ?? '').trim(),
            amount: Number(m.amount) || 0,
            dueDate: m.dueDate ? String(m.dueDate) : null,
          }))
          .filter((m: { label: string; amount: number }) => m.label && m.amount > 0)
      : []
    return {
      title: parsed.title ? String(parsed.title).slice(0, 120) : undefined,
      total: parsed.total != null && Number.isFinite(Number(parsed.total)) ? Number(parsed.total) : undefined,
      milestones,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Extraction failed.' }
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'Choose a PDF to extract.' })
  }
  if (file.size > 15 * 1024 * 1024) return Response.json({ error: 'PDF is too large (max 15 MB).' })

  let text = ''
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const buf = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocumentProxy(buf)
    const r = await extractText(pdf, { mergePages: true })
    const raw: unknown = r.text
    text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('\n') : ''
  } catch {
    return Response.json({ error: 'Could not read the PDF.' })
  }
  if (!text.trim()) {
    return Response.json({ error: 'No text found in the PDF — is it a scanned image?' })
  }

  return Response.json(await extractWithOpenAI(text))
}
