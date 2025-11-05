import { query } from '../models/database';
import type { LeagueAlias, TeamAlias } from '../types';

type AliasRecord = {
  canonicalKey: string;
  nameEn?: string | null;
  nameZhCn?: string | null;
  nameZhTw?: string | null;
  aliases: string[];
};

type ResolvedName = {
  canonicalKey: string;
  displayName: string;
  fallbackName: string;
  source?: 'canonical' | 'alias' | 'fallback';
  raw?: string;
  meta?: {
    en?: string | null;
    zh_cn?: string | null;
    zh_tw?: string | null;
  };
};

const NORMALIZE_REGEX = /[\s·•'".,_\-(){}\[\]【】（）\/\\]+/g;

const normalize = (value?: string | null): string => {
  if (!value) return '';
  const trimmed = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(NORMALIZE_REGEX, ' ')
    .trim()
    .toLowerCase();
  return trimmed;
};

const canonicalFromRaw = (value: string, type: 'league' | 'team'): string => {
  const normalized = normalize(value);
  return normalized ? `${type}:${normalized}` : `${type}:unknown`;
};

class NameAliasService {
  private leagueCache: AliasRecord[] = [];
  private teamCache: AliasRecord[] = [];
  private loadedAt = 0;
  private readonly ttl = 60 * 1000; // 1 minute

  private async ensureLoaded(): Promise<void> {
    const now = Date.now();
    if (now - this.loadedAt < this.ttl && this.leagueCache.length && this.teamCache.length) {
      return;
    }

    const [leagueResult, teamResult] = await Promise.all([
      query('SELECT * FROM league_aliases'),
      query('SELECT * FROM team_aliases'),
    ]);

    const parseAliases = (value: any): string[] => {
      if (!value && value !== 0) return [];
      if (Array.isArray(value)) return value as string[];
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      if (value && typeof value === 'object' && Array.isArray((value as any).values)) {
        return (value as any).values as string[];
      }
      return [];
    };

    const leagueRows: LeagueAlias[] = leagueResult.rows.map((row: any) => ({
      ...row,
      aliases: parseAliases(row.aliases),
    }));
    const teamRows: TeamAlias[] = teamResult.rows.map((row: any) => ({
      ...row,
      aliases: parseAliases(row.aliases),
    }));

    this.leagueCache = leagueRows.map((row) => ({
      canonicalKey: row.canonical_key,
      nameEn: row.name_en,
      nameZhCn: row.name_zh_cn,
      nameZhTw: row.name_zh_tw,
      aliases: this.buildAliasSet(row),
    }));

    this.teamCache = teamRows.map((row) => ({
      canonicalKey: row.canonical_key,
      nameEn: row.name_en,
      nameZhCn: row.name_zh_cn,
      nameZhTw: row.name_zh_tw,
      aliases: this.buildAliasSet(row),
    }));

    this.loadedAt = now;
  }

  private buildAliasSet(record: { name_en?: string | null; name_zh_cn?: string | null; name_zh_tw?: string | null; aliases?: string[] }): string[] {
    const set = new Set<string>();
    if (record.name_en) set.add(normalize(record.name_en));
    if (record.name_zh_cn) set.add(normalize(record.name_zh_cn));
    if (record.name_zh_tw) set.add(normalize(record.name_zh_tw));
    if (Array.isArray(record.aliases)) {
      record.aliases.forEach((alias) => {
        const normalized = normalize(alias);
        if (normalized) set.add(normalized);
      });
    }
    return Array.from(set).filter(Boolean);
  }

  private resolveFromCache(value: string, cache: AliasRecord[], fallbackType: 'league' | 'team'): ResolvedName {
    const raw = value || '';
    const normalized = normalize(raw);

    if (!normalized) {
      const fallbackKey = `${fallbackType}:unknown`;
      return {
        canonicalKey: fallbackKey,
        displayName: raw,
        fallbackName: raw,
        source: 'fallback',
        raw,
      };
    }

    const record = cache.find((item) => item.aliases.includes(normalized));

    if (record) {
      const display = record.nameZhCn || record.nameZhTw || record.nameEn || raw;
      return {
        canonicalKey: record.canonicalKey,
        displayName: display,
        fallbackName: raw,
        source: record.nameZhCn || record.nameZhTw || record.nameEn ? 'canonical' : 'alias',
        raw,
        meta: {
          en: record.nameEn,
          zh_cn: record.nameZhCn,
          zh_tw: record.nameZhTw,
        },
      };
    }

    const fallbackKey = canonicalFromRaw(raw, fallbackType);
    return {
      canonicalKey: fallbackKey,
      displayName: raw,
      fallbackName: raw,
      source: 'fallback',
      raw,
    };
  }

  async resolveLeague(name: string): Promise<ResolvedName> {
    await this.ensureLoaded();
    return this.resolveFromCache(name, this.leagueCache, 'league');
  }

  async resolveTeam(name: string): Promise<ResolvedName> {
    await this.ensureLoaded();
    return this.resolveFromCache(name, this.teamCache, 'team');
  }

  normalizeKey(type: 'league' | 'team', name: string): string {
    const normalized = normalize(name);
    if (!normalized) {
      return `${type}:unknown`;
    }
    return `${type}:${normalized}`;
  }
}

export const nameAliasService = new NameAliasService();
export type { ResolvedName };
