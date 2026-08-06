// Vendor contracts + payment milestones (the money layer). Enforcement lives in
// the DB (milestones ≤ 100%, activation needs exactly 100%); this layer just
// orchestrates. Amounts come back as numbers (numeric ::float8) for the grid —
// the database keeps the exact numeric(14,2) and is the source of truth.

import { withUser } from '../withUser.js'

export interface MilestoneInput {
  id: string | null // null = a new row
  label: string
  amount: number
  dueDate: string | null // 'YYYY-MM-DD'
  sortOrder: number
}
export interface MilestoneRow {
  id: string
  label: string
  amount: number
  due_date: string | null
  paid: boolean
  sort_order: number
}
export interface ContractRow {
  id: string
  vendor_id: string
  vendor_name: string
  title: string
  total_amount: number
  status: string
  planned: number // sum of milestone amounts
  paid: number // sum of paid milestone amounts
  next_due: string | null
}
export interface ContractDetail {
  id: string
  project_id: string
  vendor_id: string
  vendor_name: string
  title: string
  total_amount: number
  status: string
  source: string
  notes: string | null
  milestones: MilestoneRow[]
}
export interface PendingPayment {
  contract_id: string
  milestone_id: string
  vendor_name: string
  project_id: string
  project_name: string
  label: string
  amount: number
  due_date: string
  overdue: boolean
}

export async function createContract(
  userId: string,
  input: {
    projectId: string
    vendorId: string
    title: string
    totalAmount: number
    source?: 'MANUAL' | 'PDF_EXTRACTED'
    notes?: string | null
    milestones?: { label: string; amount: number; dueDate: string | null }[]
  },
): Promise<{ id: string }> {
  return withUser(userId, async (tx) => {
    const c = await tx.query<{ id: string }>(
      `insert into vendor_contracts (project_id, vendor_id, title, total_amount, source, notes)
       values ($1, $2, $3, $4, $5::contract_source, $6) returning id`,
      [input.projectId, input.vendorId, input.title, input.totalAmount, input.source ?? 'MANUAL', input.notes ?? null],
    )
    const id = c.rows[0].id
    const ms = input.milestones ?? []
    for (let i = 0; i < ms.length; i++) {
      await tx.query(
        `insert into contract_milestones (contract_id, label, amount, due_date, sort_order)
         values ($1, $2, $3, $4, $5)`,
        [id, ms[i].label, ms[i].amount, ms[i].dueDate, i],
      )
    }
    return { id }
  })
}

export async function listProjectContracts(userId: string, projectId: string): Promise<ContractRow[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<ContractRow>(
      `select vc.id, vc.vendor_id, vp.name as vendor_name, vc.title,
              vc.total_amount::float8 as total_amount, vc.status::text as status,
              coalesce((select sum(amount) from contract_milestones m where m.contract_id = vc.id), 0)::float8 as planned,
              coalesce((select sum(amount) from contract_milestones m where m.contract_id = vc.id and m.paid), 0)::float8 as paid,
              (select to_char(min(due_date), 'YYYY-MM-DD') from contract_milestones m
                 where m.contract_id = vc.id and m.paid = false and m.due_date is not null) as next_due
         from vendor_contracts vc
         join vendor_profiles vp on vp.id = vc.vendor_id
        where vc.project_id = $1
        order by vc.created_at desc`,
      [projectId],
    )
    return r.rows
  })
}

export async function getContract(userId: string, contractId: string): Promise<ContractDetail | null> {
  return withUser(userId, async (tx) => {
    const c = await tx.query<Omit<ContractDetail, 'milestones'>>(
      `select vc.id, vc.project_id, vc.vendor_id, vp.name as vendor_name, vc.title,
              vc.total_amount::float8 as total_amount, vc.status::text as status,
              vc.source::text as source, vc.notes
         from vendor_contracts vc
         join vendor_profiles vp on vp.id = vc.vendor_id
        where vc.id = $1`,
      [contractId],
    )
    if (c.rows.length === 0) return null
    const m = await tx.query<MilestoneRow>(
      `select id, label, amount::float8 as amount, to_char(due_date, 'YYYY-MM-DD') as due_date,
              paid, sort_order
         from contract_milestones where contract_id = $1 order by sort_order, created_at`,
      [contractId],
    )
    return { ...c.rows[0], milestones: m.rows }
  })
}

/** Replace the contract's payment plan with the grid's rows (upsert by id, delete the rest). */
export async function saveMilestones(
  userId: string,
  input: { contractId: string; milestones: MilestoneInput[] },
): Promise<void> {
  await withUser(userId, async (tx) => {
    const keep = input.milestones.filter((m) => m.id).map((m) => m.id as string)
    await tx.query(`delete from contract_milestones where contract_id = $1 and not (id = any($2::uuid[]))`, [
      input.contractId,
      keep,
    ])
    for (const m of input.milestones) {
      if (m.id) {
        await tx.query(
          `update contract_milestones set label = $2, amount = $3, due_date = $4, sort_order = $5
             where id = $1 and contract_id = $6`,
          [m.id, m.label, m.amount, m.dueDate, m.sortOrder, input.contractId],
        )
      } else {
        await tx.query(
          `insert into contract_milestones (contract_id, label, amount, due_date, sort_order)
           values ($1, $2, $3, $4, $5)`,
          [input.contractId, m.label, m.amount, m.dueDate, m.sortOrder],
        )
      }
    }
  })
}

export async function activateContract(userId: string, contractId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`update vendor_contracts set status = 'ACTIVE' where id = $1`, [contractId])
  })
}

export async function setContractDraft(userId: string, contractId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`update vendor_contracts set status = 'DRAFT' where id = $1`, [contractId])
  })
}

export async function deleteContract(userId: string, contractId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`delete from vendor_contracts where id = $1`, [contractId])
  })
}

export async function markMilestonePaid(
  userId: string,
  input: { milestoneId: string; paid: boolean },
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update contract_milestones set paid = $2, paid_at = case when $2 then now() else null end where id = $1`,
      [input.milestoneId, input.paid],
    )
  })
}

/** Unpaid milestones on ACTIVE contracts due within `withinDays` (incl. overdue) — the dashboard widget. */
export async function pendingVendorPayments(
  userId: string,
  withinDays = 7,
): Promise<PendingPayment[]> {
  return withUser(userId, async (tx) => {
    const r = await tx.query<PendingPayment>(
      `select vc.id as contract_id, cm.id as milestone_id, vp.name as vendor_name,
              vc.project_id, p.name as project_name, cm.label, cm.amount::float8 as amount,
              to_char(cm.due_date, 'YYYY-MM-DD') as due_date,
              (cm.due_date < current_date) as overdue
         from contract_milestones cm
         join vendor_contracts vc on vc.id = cm.contract_id
         join vendor_profiles vp on vp.id = vc.vendor_id
         join projects p on p.id = vc.project_id
        where vc.status = 'ACTIVE' and cm.paid = false and cm.due_date is not null
          and cm.due_date <= current_date + make_interval(days => $1)
        order by cm.due_date`,
      [withinDays],
    )
    return r.rows
  })
}
