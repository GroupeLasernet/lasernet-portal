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
//   Unassigned    → ben@lead     (@ before "lead")
//   Lead          → ben@abc or ben@lead
//
// Layout (Hugo, 2026-04-19): four stacked containers instead of
// tabs. Every section shows its own header, description, and
// count. Global search filters across all four. Unassigned =
// pre-meeting leads not yet linked to a business.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';

type StaffType = 'prisma' | 'client' | 'unassigned' | 'lead';

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

// Section metadata — order here drives vertical order on the page.
const SECTIONS: {
  key: StaffType;
  titleEn: string;
  titleFr: string;
  descEn: string;
  descFr: string;
  accent: string; // tailwind text color for count badge
}[] = [
  {
    key: 'prisma',
    titleEn: 'Prisma Staff',
    titleFr: 'Personnel Prisma',
    descEn: 'Internal team members with admin access.',
    descFr: 'Membres internes avec accès administrateur.',
    accent: 'text-pink-600 dark:text-pink-300',
  },
  {
    key: 'client',
    titleEn: 'Client Staff',
    titleFr: 'Personnel client',
    descEn: 'People working at a client business — main contacts and staff.',
    descFr: 'Personnes travaillant pour une entreprise cliente — contacts principaux et personnel.',
    accent: 'text-blue-600 dark:text-blue-300',
  },
  {
    key: 'unassigned',
    titleEn: 'Unassigned',
    titleFr: 'Non assignés',
    descEn: 'Not linked to any business yet and no completed meeting.',
    descFr: 'Pas encore liés à une entreprise et sans rencontre complétée.',
    accent: 'text-gray-500 dark:text-gray-400',
  },
  {
    key: 'lead',
    titleEn: 'Leads',
    titleFr: 'Prospects',
    descEn: 'Real prospects — linked to a business or past the first meeting.',
    descFr: 'Prospects réels — liés à une entreprise ou au-delà de la première rencontre.',
    accent: 'text-amber-600 dark:text-amber-300',
  },
];

export default function PeoplePage() {
  const { t, lang } = useLanguage();
  const fr = lang === 'fr';

  const [people, setPeople] = useState<PeopleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
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

  // Apply the global search once — then group by staffType.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (p: PeopleRecord) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q) ||
        (p.clientName || '').toLowerCase().includes(q)
      );
    };
    const by: Record<StaffType, PeopleRecord[]> = {
      prisma: [], client: [], unassigned: [], lead: [],
    };
    for (const p of people) if (matches(p)) by[p.staffType].push(p);
    return by;
  }, [people, search]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('nav', 'people')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {fr
            ? 'Personnel Prisma, personnel client, non assignés et prospects — identifiés par un handle (@nom pour Prisma, nom@entreprise pour les clients).'
            : 'Prisma Staff, Client Staff, unassigned and leads — each tagged with a handle (@name for Prisma, name@company for clients).'}
        </p>
      </div>

      {/* Global search */}
      <div className="mb-6">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={fr ? 'Rechercher par nom, handle, email, entreprise…' : 'Search by name, handle, email, company…'}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:border-brand-500"
        />
      </div>

      {loading ? (
        <div className="p-12 flex justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
        </div>
      ) : err ? (
        <div className="p-6 text-sm text-red-600 bg-white dark:bg-gray-800 rounded-xl border border-red-200">{err}</div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(sec => (
            <PeopleContainer
              key={sec.key}
              section={sec}
              rows={grouped[sec.key]}
              fr={fr}
              searching={search.trim().length > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────

function PeopleContainer({
  section,
  rows,
  fr,
  searching,
}: {
  section: typeof SECTIONS[number];
  rows: PeopleRecord[];
  fr: boolean;
  searching: boolean;
}) {
  // When the user is searching and a container has zero matches, hide it
  // to keep focus on what matched. When idle, show empty sections so the
  // directory feels complete.
  if (searching && rows.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {fr ? section.titleFr : section.titleEn}
            <span className={`text-xs font-mono ${section.accent}`}>{rows.length}</span>
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {fr ? section.descFr : section.descEn}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-gray-400">
          {fr ? 'Personne ici pour le moment.' : 'Nobody here yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map(p => <PersonRow key={`${p.source}:${p.id}`} p={p} fr={fr} />)}
        </ul>
      )}

    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function PersonRow({ p, fr }: { p: PeopleRecord; fr: boolean }) {
  const router = useRouter();

  // Route an edit click to the right upstream management page based on the
  // person's source record. User → team page, Contact → businesses (contacts
  // are managed through their business), Lead → leads page *with the
  // specific lead's detail panel auto-opened* via ?id=<leadId> so Hugo lands
  // directly on the edit surface instead of the generic list.
  const editHref = (() => {
    switch (p.source) {
      case 'user':    return '/admin/settings?tab=team';
      case 'contact': return p.clientId
        ? `/admin/businesses?client=${p.clientId}`
        : '/admin/businesses';
      case 'lead':    return `/admin/leads?id=${encodeURIComponent(p.id)}`;
      default:        return '/admin/people';
    }
  })();

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
          {p.kind && p.kind !== p.staffType && <KindBadge kind={p.kind} fr={fr} />}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {[p.email, p.phone, p.clientName || p.company].filter(Boolean).join(' • ')}
        </div>
      </div>
      <button
        type="button"
        onClick={() => router.push(editHref)}
        title={fr ? 'Modifier' : 'Edit'}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors flex-shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <span className="hidden sm:inline">{fr ? 'Modifier' : 'Edit'}</span>
      </button>
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
