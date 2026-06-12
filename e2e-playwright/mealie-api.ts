import type { APIRequestContext } from '@playwright/test';

import { normalizeUrl } from '../utils/network';

export type MealieRecipeSummary = {
    slug: string;
    name?: string;
    orgURL?: string | null;
};

function normalizeMealieBase(serverUrl: string): string {
    return serverUrl.trim().replace(/\/+$/, '');
}

/** Mealie list endpoint returns `{ items: RecipeSummary[] }`. */
export async function fetchRecentRecipes(
    request: APIRequestContext,
    mealieBase: string,
    token: string,
    perPage = 100,
): Promise<MealieRecipeSummary[]> {
    const base = normalizeMealieBase(mealieBase);
    const apiUrl = new URL('/api/recipes', base);
    apiUrl.searchParams.set('perPage', String(perPage));
    apiUrl.searchParams.set('orderBy', 'dateUpdated');
    apiUrl.searchParams.set('orderDirection', 'desc');

    const res = await request.get(apiUrl.href, {
        headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/json',
        },
    });
    if (!res.ok()) {
        const text = await res.text();
        throw new Error(`GET ${apiUrl.href} failed: ${res.status()} ${text}`);
    }
    const data = (await res.json()) as { items?: MealieRecipeSummary[] };
    return data.items ?? [];
}

/** Poll until a recipe appears whose orgURL matches (normalized compare optional). */
export async function waitForRecipeMatchingUrl(options: {
    request: APIRequestContext;
    mealieBase: string;
    token: string;
    pageUrl: string;
    timeoutMs: number;
    intervalMs?: number;
}): Promise<MealieRecipeSummary> {
    const { request, mealieBase, token, pageUrl, timeoutMs, intervalMs = 3000 } = options;
    const deadline = Date.now() + timeoutMs;
    let lastCount = 0;

    while (Date.now() < deadline) {
        const recipes = await fetchRecentRecipes(request, mealieBase, token);
        lastCount = recipes.length;
        const normalizedPage = normalizeUrl(pageUrl);
        const hit = recipes.find((r) => r.orgURL && normalizeUrl(r.orgURL) === normalizedPage);
        if (hit) return hit;

        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(
        `Timed out waiting for a recipe with orgURL matching the page (${pageUrl}). Last fetch had ${lastCount} recipes.`,
    );
}

/** Poll `GET /api/recipes` until `items` includes a recipe with the given slug (Level 3 Mealie assert style). */
export async function waitForRecipeSlugInItems(options: {
    request: APIRequestContext;
    mealieBase: string;
    token: string;
    slug: string;
    timeoutMs: number;
    intervalMs?: number;
}): Promise<MealieRecipeSummary[]> {
    const { request, mealieBase, token, slug, timeoutMs, intervalMs = 3000 } = options;
    const deadline = Date.now() + timeoutMs;
    let lastItems: MealieRecipeSummary[] = [];

    while (Date.now() < deadline) {
        lastItems = await fetchRecentRecipes(request, mealieBase, token);
        if (lastItems.some((r) => r.slug === slug)) {
            return lastItems;
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(
        `Timed out waiting for slug "${slug}" in GET /api/recipes items (last count: ${lastItems.length}).`,
    );
}
