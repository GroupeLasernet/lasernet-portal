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
    email: 'Courriel (optionnel)',
    phone: 'T\u00e9l\u00e9phone (optionnel)',
    company: 'Entreprise (optionnel)',
    purpose: 'Objet de la visite',
    purposePlaceholder: 'S\u00e9lectionnez...',
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
    staffTitle: 'Connexion employ\u00e9',
    staffEmail: 'Courriel',
    staffPassword: 'Mot de passe',
    staffLogin: 'Se connecter',
    cameraPrompt: 'Photo de visite',
    cameraError: 'Cam\u00e9ra non disponible',
    submitting: 'Envoi en cours\u2026',
    back: 'Retour',
  },
  en: {
    welcome: 'Welcome to Atelier DSM',
    subtitle: 'Please register your visit',
    register: 'Register',
    staffLink: 'Staff Login',
    name: 'Full Name',
    email: 'Email (optional)',
    phone: 'Phone (optional)',
    company: 'Company (optional)',
    purpose: 'Purpose of Visit',
    purposePlaceholder: 'Select...',
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
    staffTitle: 'Staff Login',
    staffEmail: 'Email',
    staffPassword: 'Password',
    staffLogin: 'Log in',
    cameraPrompt: 'Visitor Photo',
    cameraError: 'Camera unavailable',
    submitting: 'Submitting\u2026',
    back: 'Back',
  },
} as const

type Lang = keyof typeof t
type Screen = 'welcome' | 'form' | 'thanks'

const PURPOSE_KEYS = ['purposeInquiry', 'purposeDemo', 'purposeMeeting', 'purposeService', 'purposeOther'] as const
const PURPOSE_VALUES = ['inquiry', 'demo', 'meeting', 'service', 'other'] as const

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
        }),
      })
      setScreen('thanks')
    } catch {
      /* silently move to thanks — kiosk should not block on network errors */
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

  /* ---- shared wrapper ---- */
  const Shell = ({ children }: { children: React.ReactNode }) => (
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

  /* ---------- WELCOME ---------- */
  if (screen === 'welcome') {
    return (
      <Shell>
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
      <Shell>
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
          <p className="text-xl text-white/60 max-w-md">{l.thanksBody}</p>
        </div>
      </Shell>
    )
  }

  /* ---------- REGISTRATION FORM ---------- */
  return (
    <Shell>
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
            {/* Name */}
            <input
              type="text"
              placeholder={l.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="bg-white/10 border border-white/20 rounded-xl text-lg py-4 px-6 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-shadow"
            />

            {/* Email */}
            <input
              type="email"
              placeholder={l.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

            {/* Company */}
            <input
              type="text"
              placeholder={l.company}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl text-lg py-4 px-6 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-600 transition-shadow"
            />

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
