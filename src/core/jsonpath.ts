/**
 * A deliberately small JSONPath subset used by the HTTP data source mapping.
 *
 * Supported:
 *   $.a.b            -> property access
 *   $.a[0].b         -> array index
 *   $.a[*].b         -> wildcard, expands arrays (returns a flat list)
 *   a.b              -> leading `$` / `$.` optional
 *
 * That is enough to map 95% of REST payloads without letting users run code.
 */

type Seg =
	| { type: 'key'; key: string }
	| { type: 'index'; index: number }
	| { type: 'wildcard' };

export function parsePath(path: string): Seg[] {
	const segs: Seg[] = [];
	const cleaned = path.trim().replace(/^\$\.?/, '');
	if (!cleaned || cleaned === '$') return segs;
	const re = /([^.[\]]+)|\[(\d+|\*)\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(cleaned)) !== null) {
		if (m[1] !== undefined) {
			segs.push({ type: 'key', key: m[1] });
		} else if (m[2] === '*') {
			segs.push({ type: 'wildcard' });
		} else if (m[2] !== undefined) {
			segs.push({ type: 'index', index: Number(m[2]) });
		}
	}
	return segs;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

/** Resolve a path to a single value (first match on wildcards). */
export function getValue(root: unknown, path: string): unknown {
	const segs = parsePath(path);
	let current: unknown = root;
	for (const seg of segs) {
		if (current === undefined || current === null) return undefined;
		if (seg.type === 'key') {
			if (!isRecord(current)) return undefined;
			current = current[seg.key];
		} else if (seg.type === 'index') {
			if (!Array.isArray(current)) return undefined;
			current = current[seg.index];
		} else {
			if (!Array.isArray(current)) return undefined;
			current = current[0];
		}
	}
	return current;
}

/**
 * Resolve a path to a list. Wildcards expand; a bare array result is returned
 * as-is; a scalar becomes a single-element list.
 */
export function getList(root: unknown, path: string): unknown[] {
	const segs = parsePath(path);
	let current: unknown[] = [root];
	for (const seg of segs) {
		const next: unknown[] = [];
		for (const item of current) {
			if (item === undefined || item === null) continue;
			if (seg.type === 'key') {
				if (isRecord(item)) next.push(item[seg.key]);
			} else if (seg.type === 'index') {
				if (Array.isArray(item)) next.push(item[seg.index]);
			} else {
				if (Array.isArray(item)) next.push(...item);
				else next.push(item);
			}
		}
		current = next;
	}
	const flat: unknown[] = [];
	for (const item of current) {
		if (Array.isArray(item)) flat.push(...item);
		else if (item !== undefined && item !== null) flat.push(item);
	}
	return flat;
}

/** Resolve a path to a string, `undefined` when missing/empty. */
export function getString(root: unknown, path: string | undefined): string | undefined {
	if (!path) return undefined;
	const value = getValue(root, path);
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'object') return undefined;
	const str = String(value).trim();
	return str.length > 0 ? str : undefined;
}

/** Resolve a path to a finite number. */
export function getNumber(root: unknown, path: string | undefined): number | undefined {
	if (!path) return undefined;
	const value = getValue(root, path);
	if (value === undefined || value === null || value === '') return undefined;
	const num = typeof value === 'number' ? value : Number(String(value).trim());
	return Number.isFinite(num) ? num : undefined;
}

/** Resolve a path to a list of strings. */
export function getStringList(root: unknown, path: string | undefined): string[] {
	if (!path) return [];
	return getList(root, path)
		.map((item) => (typeof item === 'object' && item !== null ? undefined : String(item).trim()))
		.filter((item): item is string => !!item && item.length > 0);
}
