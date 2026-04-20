'use client';

// ============================================================
// People tab — unified directory
// ------------------------------------------------------------
// Aggregates everything human in the system (Users + Contacts +
// Leads) and labels each row with a HANDLE so Hugo and Claude
// can reference individuals unambiguously in conversation.
//
//   Prisma Staff  → @hugob       (@ at front)
//   Client Staff  → ben@abc      (@ in middle)
//   Lead          → ben@lead or ben@companyslug
//
// Handles are derived server-side from the person's name — no
// schema migration needed. See src/lib/handles.ts.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';

type StaffType = 'prisma' | 'client' | 'lead';

interface PeopleRecord {
  id: string;
  source: 'user' | 'contact' | 'lead';
  staffType: StaffType;
  kind: string;
  name: string;
  handle: string;
  email: string | null;
  phone: string | null;
  photo: string | null;
  company: string | null;
  role: string | null;
  clientId: string | null;
  clientName: string | null;
  status: string | null;
  createdAt: string;
}

const STAFF_TABS: { key: 'all' | StaffType; labelEn: string; labelFr: string }[] = [
  { key: 'all',    labelEn: 'All',           labelFr: 'Toutes' },
  { key: 'prisma', labelEn: 'Prisma Staff',  labelFr: 'Personnel Prisma' },
  { key: 'client', labelEn: 'Client Staff',  labelFr: 'Personnel client' },
  { key: 'lead',   labelEn: 'Leads',         labelFr: 'Prospects' },
];

export default function PeoplePage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  const [people, setPeople] = useState<PeopleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<'all' | StaffType>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/people', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setPeople(data.people || []);
      } catch (e: any) {
        setErr(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const counts = useMemo(() => ({
    all:    people.length,
    prisma: people.filter(p => p.staffType === 'prisma').length,
    client: people.filter(p => p.staffType === 'client').length,
    lead:   people.filter(p => p.staffType === 'lead').length,
  }), [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(p => {
      if (tab !== 'all' && p.staffType !== tab) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q)       ||
        p.handle.toLowerCase().includes(q)     ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q) ||
        (p.clientName || '').toLowerCase().includes(q)
      );
    });
  }, [people, tab, search]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('nav', 'people')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {fr
            ? 'Personnel Prisma, personnel client et prospects — identifiés par un handle (@nom pour Prisma, nom@entreprise pour les clients).'
            : 'Prisma Staff, Client Staff and leads — each tagged with a handle (@name for Prisma, name@company for clients).'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {STAFF_TABS.map(st => {
          const active = tab === st.key;
          return (
            <button
              key={st.key}
              onClick={() => setTab(st.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-brand-300'
              }`}
            >
              {fr ? st.labelFr : st.labelEn}
              <span className={`ml-2 text-xs ${active ? 'text-white/80' : 'text-gray-400'}`}>
                {counts[st.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={fr ? 'Rechercher par nom, handle, email, entreprise…' : 'Search by name, handle, email, company…'}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-brand-500"
        />
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
          </div>
        ) : err ? (
          <div className="p-6 text-sm text-red-600">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {fr ? 'Aucune personne ne correspond.' : 'No people match.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map(p => <PersonRow key={`${p.source}:${p.id}`} p={p} fr={fr} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function PersonRow({ p, fr }: { p: PeopleRecord; fr: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <Avatar photo={p.photo} name={p.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-800 dark:text-gray-100 truncate">{p.name}</span>
          {p.handle && (
            <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[11px] font-mono text-gray-600 dark:text-gray-300">
              {p.handle}
            </span>
          )}
          <StaffTypeBadge type={p.staffType} fr={fr} />
          {p.kind && p.kind !== p.staffType && <KindBadge kind={p.kind} fr={fr} />}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {[p.email, p.phone, p.clientName || p.company].filter(Boolean).join(' • ')}
        </div>
      </div>
    </li>
  );
}

function Avatar({ photo, name }: { photo: string | null; name: string }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />;
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(s => s[0] || '')
    .join('')
    .toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
      {initials}
    </div>
  );
}

function StaffTypeBadge({ type, fr }: { type: StaffType; fr: boolean }) {
  const conf = {
    prisma: { bg: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300', labelEn: 'Prisma', labelFr: 'Prisma' },
    client: { bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',  labelEn: 'Client', labelFr: 'Client' },
    lead:   { bg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', labelEn: 'Lead', labelFr: 'Prospect' },
  }[type];
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${conf.bg}`}>
      {fr ? conf.labelFr : conf.labelEn}
    </span>
  );
}

function KindBadge({ kind, fr }: { kind: string; fr: boolean }) {
  const translations: Record<string, { en: string; fr: string }> = {
    admin:        { en: 'Admin',          fr: 'Admin' },
    sales:        { en: 'Sales',          fr: 'Ventes' },
    support:      { en: 'Support',        fr: 'Support' },
    technician:   { en: 'Technician',     fr: 'Technicien' },
    maincontact:  { en: 'Main contact',   fr: 'Contact principal' },
    staff:        { en: 'Staff',          fr: 'Personnel' },
    new:          { en: 'New',            fr: 'Nouveau' },
    qualified:    { en: 'Qualified',      fr: 'Qualifié' },
    demo_scheduled: { en: 'Demo booked',  fr: 'Démo planifiée' },
    demo_done:    { en: 'Demo done',      fr: 'Démo faite' },
    quote_sent:   { en: 'Quote sent',     fr: 'Soumission envoyée' },
    negotiation:  { en: 'Negotiation',    fr: 'Négociation' },
    won:          { en: 'Won',            fr: 'Gagné' },
    lost:         { en: 'Lost',           fr: 'Perdu' },
  };
  const label = translations[kind]?.[fr ? 'fr' : 'en'] || kind;
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      {label}
    </span>
  );
}
