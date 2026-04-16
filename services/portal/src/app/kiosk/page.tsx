'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'

/* ---------- inline translations (FR default) ---------- */
const t = {
  fr: {
    welcome: 'Bienvenue chez Atelier DSM',
    subtitle: 'Veuillez vous enregistrer',
    register: "S'enregistrer",
    staffLink: 'Connexion employ\u00e9',
    name: 'Nom complet',
    email: 'Courriel',
    phone: 'T\u00e9l\u00e9phone (optionnel)',
    company: 'Entreprise (optionnel)',
    purpose: 'Objet de la visite',
    purposePlaceholder: 'Raison de votre visite\u2026',
    purposeInquiry: 'Demande d\u2019information',
    purposeDemo: 'D\u00e9monstration',
    purposeMeeting: 'Rendez-vous',
    purposeService: 'Service',
    purposeOther: 'Autre',
    takePhoto: 'Prendre une photo',
    retake: 'Reprendre',
    submit: "M'enregistrer",
    thanksTitle: 'Merci !',
    thanksBody: 'Un membre de notre \u00e9quipe sera avec vous sous peu.',
    next: 'Suivant',
    staffTitle: 'Connexion employ\u00e9',
    staffEmail: 'Courriel',
    staffPassword: 'Mot de passe',
    staffLogin: 'Se connecter',
    cameraPrompt: 'Photo de visite',
    cameraError: 'Cam\u00e9ra non disponible',
    submitting: 'Envoi en cours\u2026',
    back: 'Retour',
    visitingNow: 'En visite',
    welcomeBack: 'Bon retour',
    orRegisterNew: 'Ou remplir le formulaire ci-dessous',
    checkingIn: 'Enregistrement\u2026',
    businessFound: 'Entreprise reconnue',
    linkedTo: 'Li\u00e9 \u00e0',
    qbClient: 'Client QB',
    localBusiness: 'Entreprise locale',
  },
  en: {
    welcome: 'Welcome to Atelier DSM',
    subtitle: 'Please register your visit',
    register: 'Register',
    staffLink: 'Staff Login',
    name: 'Full Name',
    email: 'Email',
    phone: 'Phone (optional)',
    company: 'Company (optional)',
    purpose: 'Purpose of Visit',
    purposePlaceholder: 'Reason for your visit\u2026',
    purposeInquiry: 'Inquiry',
    purposeDemo: 'Demo',
    purposeMeeting: 'Meeting',
    purposeService: 'Service',
    purposeOther: 'Other',
    takePhoto: 'Take Photo',
    retake: 'Retake',
    submit: 'Register',
    thanksTitle: 'Thank you!',
    thanksBody: 'A team member will be with you shortly.',
    next: 'Next',
    staffTitle: 'Staff Login',
    staffEmail: 'Email',
    staffPassword: 'Password',
    staffLogin: 'Log in',
    cameraPrompt: 'Visitor Photo',
    cameraError: 'Camera unavailable',
    submitting: 'Submitting\u2026',
    back: 'Back',
    visitingNow: 'Visiting now',
    welcomeBack: 'Welcome back',
    orRegisterNew: 'Or fill out the form below',
    checkingIn: 'Checking in\u2026',
    businessFound: 'Business recognized',
    linkedTo: 'Linked to',
    qbClient: 'QB Client',
    localBusiness: 'Local business',
  },
} as const

type Lang = keyof typeof t
type Screen = 'welcome' | 'form' | 'thanks'

interface LeadSuggestion {
  id: string
  name: string
  email: string | null
  company: string | null
  photo: string | null
}

interface BusinessSuggestion {
  id: string
  name: string
  email: string | null
  type: 'managed' | 'local'
}

const PURPOSE_KEYS = ['purposeInquiry', 'purposeDemo', 'purposeMeeting', 'purposeService', 'purposeOther'] as const
const PURPOSE_VALUES = ['inquiry', 'demo', 'meeting', 'service', 'other'] as const

/* Shell must be outside KioskPage so React doesn't remount it on every re-render */
function Shell({ lang, setLang, children }: { lang: Lang; setLang: (l: Lang) => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-gray-950 text-white flex flex-col overflow-auto">
      {/* language toggle */}
      <div className="absolute top-6 right-6 z-10 flex gap-2">
        {(['fr', 'en'] as const).map((code) => (
          <button
            key={code}
            onClick={() => setLang(code)}
            className={`px-4 py-2 rounded-full text-sm font-semibold uppercase tracking-wide transition-colors ${
              lang === code
                ? 'bg-brand-600 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {code}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}

export default function KioskPage() {
  /* ---- global state ---- */
  const [lang, setLang] = useState<Lang>('fr')
  const [screen, setScreen] = useState<Screen>('welcome')
  const l = t[lang]

  /* ---- form state ---- */
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [purpose, setPurpose] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /* ---- name search / autocomplete ---- */
  const [suggestions, setSuggestions] = useState<LeadSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedLead, setSelectedLead] = useState<LeadSuggestion | null>(null)
  const [quickCheckingIn, setQuickCheckingIn] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  /* ---- business search / autocomplete ---- */
  const [businessSuggestions, setBusinessSuggestions] = useState<BusinessSuggestion[]>([])
  const [showBusinessSuggestions, setShowBusinessSuggestions] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessSuggestion | null>(null)
  const [businessAutoDetected, setBusinessAutoDetected] = useState(false)
  const businessSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const businessSuggestionsRef = useRef<HTMLDivElement>(null)
  const emailDomainTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  /* Focus name field once when entering the form screen */
  useEffect(() => {
    if (screen === 'form') {
      // Small delay to ensure the input is mounted
      const timer = setTimeout(() => nameInputRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [screen])

  const searchLeads = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const res = await fetch(`/api/kiosk/search?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      setSuggestions(data.results || [])
      setShowSuggestions((data.results || []).length > 0)
    } catch {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [])

  const searchBusinesses = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setBusinessSuggestions([])
      setShowBusinessSuggestions(false)
      return
    }
    try {
      const res = await fetch(`/api/kiosk/businesses?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json()
      setBusinessSuggestions(data.results || [])
      setShowBusinessSuggestions((data.results || []).length > 0)
    } catch {
      setBusinessSuggestions([])
      setShowBusinessSuggestions(false)
    }
  }, [])

  const searchBusinessByDomain = useCallback(async (domain: string) => {
    if (domain.length < 2) return
    try {
      const res = await fetch(`/api/kiosk/businesses?domain=${encodeURIComponent(domain)}`)
      const data = await res.json()
      const results: BusinessSuggestion[] = data.results || []
      if (results.length > 0) {
        return results[0]
      }
      return null
    } catch {
      return null
    }
  }, [])

  const handleNameChange = (value: string) => {
    setName(value)
    setSelectedLead(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => searchLeads(value), 300)
  }

  const handleSelectLead = (lead: LeadSuggestion) => {
    setSelectedLead(lead)
    setName(lead.name)
    setEmail(lead.email || '')
    setCompany(lead.company || '')
    setShowSuggestions(false)
  }

  const handleQuickCheckIn = async (lead: LeadSuggestion) => {
    setQuickCheckingIn(true)
    try {
      await fetch('/api/kiosk/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: lead.name,
          email: lead.email,
          phone: null,
          company: lead.company,
          purpose: null,
          photo: null,
          ...(selectedBusiness ? { companyId: selectedBusiness.id, companyType: selectedBusiness.type } : {}),
        }),
      })
      setScreen('thanks')
    } catch {
      setScreen('thanks')
    } finally {
      setQuickCheckingIn(false)
    }
  }

  const handleCompanyChange = (value: string) => {
    setCompany(value)
    // Clear selected business if user manually edits the field
    if (selectedBusiness && value !== selectedBusiness.name) {
      setSelectedBusiness(null)
      setBusinessAutoDetected(false)
    }
    if (businessSearchTimeout.current) clearTimeout(businessSearchTimeout.current)
    businessSearchTimeout.current = setTimeout(() => searchBusinesses(value), 300)
  }

  const handleSelectBusiness = (biz: BusinessSuggestion) => {
    setSelectedBusiness(biz)
    setCompany(biz.name)
    setShowBusinessSuggestions(false)
    setBusinessAutoDetected(false)
  }

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmail(value)

      // Domain auto-matching
      if (emailDomainTimeout.current) clearTimeout(emailDomainTimeout.current)

      const atIndex = value.indexOf('@')
      if (atIndex >= 0) {
        const domain = value.slice(atIndex + 1).trim().toLowerCase()
        if (domain.length >= 2) {
          emailDomainTimeout.current = setTimeout(async () => {
            const match = await searchBusinessByDomain(domain)
            if (match) {
              // Only auto-select if no business is currently selected
              setSelectedBusiness((current) => {
                if (current) return current
                setCompany(match.name)
                setBusinessAutoDetected(true)
                return match
              })
            }
          }, 300)
        }
      }
    },
    [searchBusinessByDomain],
  )

  /* close suggestions when clicking outside */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
      if (businessSuggestionsRef.current && !businessSuggestionsRef.current.contains(e.target as Node)) {
        setShowBusinessSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  /* ---- camera ---- */
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(false)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraReady(true)
      setCameraError(false)
    } catch {
      setCameraError(true)
      setCameraReady(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraReady(false)
  }, [])

  /* start camera when entering form, stop on leave */
  useEffect(() => {
    if (screen === 'form') {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    setPhoto(canvas.toDataURL('image/jpeg', 0.8))
  }

  /* ---- staff login state ---- */
  const [staffOpen, setStaffOpen] = useState(false)
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffError, setStaffError] = useState('')

  /* ---- reset everything ---- */
  const resetAll = useCallback(() => {
    setScreen('welcome')
    setName('')
    setEmail('')
    setPhone('')
    setCompany('')
    setPurpose('')
    setPhoto(null)
    setSubmitting(false)
    setStaffOpen(false)
    setStaffEmail('')
    setStaffPassword('')
    setStaffError('')
    setSuggestions([])
    setShowSuggestions(false)
    setSelectedLead(null)
    setQuickCheckingIn(false)
    setBusinessSuggestions([])
    setShowBusinessSuggestions(false)
    setSelectedBusiness(null)
    setBusinessAutoDetected(false)
  }, [])

  /* auto-reset from thanks screen */
  useEffect(() => {
    if (screen !== 'thanks') return
    const timer = setTimeout(resetAll, 10_000)
    return () => clearTimeout(timer)
  }, [screen, resetAll])

  /* ---- handlers ---- */
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/kiosk/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
          purpose: purpose || null,
          photo: photo || null,
          ...(selectedBusiness ? { companyId: selectedBusiness.id, companyType: selectedBusiness.type } : {}),
        }),
      })
      setScreen('thanks')
    } catch {
      /* silently move to thanks -- kiosk should not block on network errors */
      setScreen('thanks')
    }
  }

  const handleStaffLogin = async (e: FormEvent) => {
    e.preventDefault()
    setStaffError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: staffEmail, password: staffPassword }),
      })
      if (!res.ok) {
        setStaffError(lang === 'fr' ? 'Identifiants invalides' : 'Invalid credentials')
        return
      }
      window.location.href = '/admin/leads'
    } catch {
      setStaffError(lang === 'fr' ? 'Erreur r\u00e9seau' : 'Network error')
    }
  }

  /* ================================================================
     RENDER
     ================================================================ */

  /* Shell is now defined outside this component to prevent remounting on re-render */

  /* ---------- WELCOME ---------- */
  if (screen === 'welcome') {
    return (
      <Shell lang={lang} setLang={setLang}>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">{l.welcome}</h1>
          <p className="text-xl text-white/60 mb-12">{l.subtitle}</p>
          <button
            onClick={() => setScreen('form')}
            className="bg-brand-600 hover:bg-brand-500 active:scale-[0.97] text-white text-2xl font-semibold px-16 py-5 rounded-2xl transition-all shadow-lg shadow-brand-600/30"
          >
            {l.register}
          </button>
        </div>
        {/* staff login link */}
        <div className="pb-8 text-center">
          <button
            onClick={() => setStaffOpen((v) => !v)}
            className="text-sm text-white/30 hover:text-white/50 underline underline-offset-4 transition-colors"
          >
            {l.staffLink}
          </button>

          {staffOpen && (
            <form
              onSubmit={handleStaffLogin}
              className="mt-6 mx-auto max-w-sm flex flex-col gap-3"
            >
              <h3 className="text-lg font-semibold text-white/70">{l.staffTitle}</h3>

              <input
                type="email"
                placeholder={l.staffEmail}
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                required
                className="bg-white/10 border border-white/20 rounded-xl text-lg py-3 px-5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <input
                type="password"
                placeholder={l.staffPassword}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                required
                className="bg-white/10 border border-white/20 rounded-xl text-lg py-3 px-5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              {staffError && <p className="text-red-400 text-sm">{staffError}</p>}
              <button
                type="submit"
                className="bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {l.staffLogin}
              </button>
            </form>
          )}
        </div>
      </Shell>
    )
  }

  /* ---------- THANK YOU ---------- */
  if (screen === 'thanks') {
    return (
      <Shell lang={lang} setLang={setLang}>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-24 h-24 rounded-full bg-brand-600/20 flex items-center justify-center mb-8">
            <svg
              className="w-12 h-12 text-brand-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">{l.thanksTitle}</h1>
          <p className="text-xl text-white/60 max-w-md mb-10">{l.thanksBody}</p>
          <button
            onClick={resetAll}
            className="bg-brand-600 hover:bg-brand-500 active:scale-[0.97] text-white text-2xl font-semibold px-16 py-5 rounded-2xl transition-all shadow-lg shadow-brand-600/30"
          >
            {l.next}
          </button>
        </div>
      </Shell>
    )
  }

  /* ---------- REGISTRATION FORM ---------- */
  return (
    <Shell lang={lang} setLang={setLang}>
      <div className="flex-1 flex flex-col items-center py-10 px-6 overflow-auto">
        <div className="w-full max-w-lg">
          {/* back button */}
          <button
            onClick={resetAll}
            className="text-white/40 hover:text-white/70 mb-6 flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {l.back}
          </button>

          <h2 className="text-3xl font-bold mb-8">{l.register}</h2>

          <form onSubmit={handleRegister} className="flex flex-col gap-5">
            {/* Name -- with autocomplete search */}
            <div className="relative" ref={suggestionsRef}>
              <input
                ref={nameInputRef}
                type="text"
                placeholder={l.name}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                required
                autoComplete="off"
                className="w-full bg-white/10 border border-white/20 rounded-xl text-lg py-4 px-6 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-shadow"
              />

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-2 bg-gray-900 border border-white/20 rounded-xl overflow-hidden shadow-2xl">
                  {suggestions.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0"
                    >
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {lead.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={lead.photo} alt="" className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-brand-600/30 flex items-center justify-center text-brand-300 font-bold text-lg">
                            {lead.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{lead.name}</p>
                        <p className="text-white/50 text-sm truncate">
                          {[lead.email, lead.company].filter(Boolean).join(' \u2022 ') || '\u00a0'}
                        </p>
                      </div>

                      {/* Quick check-in button */}
                      <button
                        type="button"
                        disabled={quickCheckingIn}
                        onClick={() => handleQuickCheckIn(lead)}
                        className="flex-shrink-0 bg-brand-600 hover:bg-brand-500 active:scale-[0.97] disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all"
                      >
                        {quickCheckingIn ? l.checkingIn : l.visitingNow}
                      </button>
                    </div>
                  ))}

                  {/* Or register new */}
                  <div className="px-5 py-3 bg-white/5 text-center">
                    <button
                      type="button"
                      onClick={() => setShowSuggestions(false)}
                      className="text-sm text-white/40 hover:text-white/60 transition-colors"
                    >
                      {l.orRegisterNew}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Selected lead banner */}
            {selectedLead && (
              <div className="flex items-center gap-3 bg-brand-600/10 border border-brand-600/30 rounded-xl px-5 py-3">
                <svg className="w-5 h-5 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-brand-300 text-sm">{l.welcomeBack}, <strong>{selectedLead.name}</strong></p>
              </div>
            )}

            {/* Email */}
            <input
              type="email"
              placeholder={l.email}
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              required
              className="bg-white/10 border border-white/20 rounded-xl text-lg py-4 px-6 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-shadow"
            />

            {/* Phone */}
            <input
              type="tel"
              placeholder={l.phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl text-lg py-4 px-6 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-shadow"
            />

            {/* Company -- with business autocomplete */}
            <div className="relative" ref={businessSuggestionsRef}>
              <input
                type="text"
                placeholder={l.company}
                value={company}
                onChange={(e) => handleCompanyChange(e.target.value)}
                onFocus={() => { if (businessSuggestions.length > 0) setShowBusinessSuggestions(true) }}
                autoComplete="off"
                className="w-full bg-white/10 border border-white/20 rounded-xl text-lg py-4 px-6 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-shadow"
              />

              {/* Business suggestions dropdown */}
              {showBusinessSuggestions && businessSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-2 bg-gray-900 border border-white/20 rounded-xl overflow-hidden shadow-2xl">
                  {businessSuggestions.map((biz) => (
                    <button
                      key={`${biz.type}-${biz.id}`}
                      type="button"
                      onClick={() => handleSelectBusiness(biz)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0 text-left"
                    >
                      {/* Icon */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                        </svg>
                      </div>

                      {/* Name + type badge */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{biz.name}</p>
                        {biz.email && <p className="text-white/40 text-sm truncate">{biz.email}</p>}
                      </div>

                      {/* Type badge */}
                      <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        biz.type === 'managed'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {biz.type === 'managed' ? l.qbClient : l.localBusiness}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected business banner */}
            {selectedBusiness && (
              <div className="flex items-center gap-3 bg-white/5 border border-white/15 rounded-xl px-5 py-3">
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.314a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm">
                    {businessAutoDetected ? l.businessFound : l.linkedTo}{' '}
                    <strong className="text-white">{selectedBusiness.name}</strong>
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  selectedBusiness.type === 'managed'
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {selectedBusiness.type === 'managed' ? l.qbClient : l.localBusiness}
                </span>
                {/* Clear button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBusiness(null)
                    setBusinessAutoDetected(false)
                  }}
                  className="flex-shrink-0 text-white/30 hover:text-white/60 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Purpose */}
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl text-lg py-4 px-6 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-brand-600 transition-shadow"
            >
              <option value="" disabled className="bg-gray-900">
                {l.purposePlaceholder}
              </option>
              {PURPOSE_KEYS.map((key, i) => (
                <option key={key} value={PURPOSE_VALUES[i]} className="bg-gray-900">
                  {l[key]}
                </option>
              ))}
            </select>

            {/* Camera / Selfie */}
            <div className="rounded-xl border border-white/20 overflow-hidden bg-black/40">
              <p className="text-sm text-white/50 px-6 pt-4 pb-2 font-medium">{l.cameraPrompt}</p>

              {!photo ? (
                <div className="relative">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-[4/3] object-cover bg-gray-900"
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <p className="text-white/40">{l.cameraError}</p>
                    </div>
                  )}

                  {cameraReady && (
                    <div className="px-6 py-4">
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="w-full bg-brand-600 hover:bg-brand-500 active:scale-[0.97] text-white font-semibold text-lg py-3 rounded-xl transition-all"
                      >
                        {l.takePhoto}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Visitor selfie" className="w-full aspect-[4/3] object-cover" />
                  <div className="px-6 py-4">
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera()
                        setPhoto(null)
                        startCamera()
                      }}
                      className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold text-lg py-3 rounded-xl transition-colors"
                    >
                      {l.retake}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="bg-brand-600 hover:bg-brand-500 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none text-white text-xl font-semibold py-5 rounded-2xl transition-all shadow-lg shadow-brand-600/30 mt-2"
            >
              {submitting ? l.submitting : l.submit}
            </button>
          </form>
        </div>
      </div>
    </Shell>
  )
}
