import { cache } from 'react'
import { getUser } from './auth'
import { getMyContext, getProject, listProjects, getRiskFacts } from '@vivahsync/db'

/**
 * Request-scoped memoised reads. A shell layout and the page it wraps both
 * need the same user/org/project/risk data; wrapping in React `cache()` means
 * the underlying pg query runs once per request instead of once per caller.
 * These are drop-in replacements for the raw functions (identical returns) —
 * a layout and its pages must all import from here to share the result.
 */
export const getUserCached = cache(getUser)
export const getMyContextCached = cache(getMyContext)
export const getProjectCached = cache(getProject)
export const listProjectsCached = cache(listProjects)
export const getRiskFactsCached = cache(getRiskFacts)
