import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent, Button, Logo } from '../../../ui'
import { HelpCircle, Shield, FileText, Info, ChevronDown, ChevronUp } from 'lucide-react'

export default function HelpScreen() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'faq' | 'privacy' | 'terms' | 'about'>('faq')
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

  const faqs = [
    {
      q: 'Does Sanchay work completely offline?',
      a: 'Yes! Sanchay is built offline-first using IndexedDB. Every transaction, account balance, budget, and report works with zero internet connection. When you reconnect, data seamlessly synchronizes to your secure cloud account.',
    },
    {
      q: 'How does cloud sync resolve conflicting edits?',
      a: 'Sanchay uses deterministic Last-Write-Wins (LWW) conflict resolution with versioning. Deletes are stored as soft tombstones so no records are accidentally lost across multiple devices.',
    },
    {
      q: 'Are my financial amounts stored accurately?',
      a: 'Absolutely. Sanchay uses minor integer arithmetic (e.g. paise or cents) for all monetary values, completely eliminating floating-point rounding errors and drift in loan calculations.',
    },
    {
      q: 'How do budget rollovers work?',
      a: 'When you enable rollover on a category budget, any unspent funds from the previous month automatically carry forward, increasing your available spending limit for the next period.',
    },
    {
      q: 'Can I export my data anytime?',
      a: 'Yes, your data belongs to you. You can export filtered transactions to CSV at any time, or generate a complete JSON backup under Settings.',
    },
  ]

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text">{t('help.title', 'Help & Information')}</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Guides, privacy commitment, and legal terms
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface-elevated border border-border rounded-xl p-1 overflow-x-auto no-scrollbar">
        {([
          { id: 'faq', label: 'Frequently Asked Questions', icon: HelpCircle },
          { id: 'privacy', label: 'Privacy Policy', icon: Shield },
          { id: 'terms', label: 'Terms of Service', icon: FileText },
          { id: 'about', label: 'About Sanchay', icon: Info },
        ] as const).map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-text-muted hover:text-text hover:bg-surface-overlay'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {activeTab === 'faq' && (
        <Card className="divide-y divide-border/50 p-2">
          {faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx
            return (
              <div key={idx} className="p-3">
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between text-left font-semibold text-sm text-text"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isOpen && (
                  <p className="mt-2 text-xs text-text-muted leading-relaxed animate-in fade-in duration-150">
                    {faq.a}
                  </p>
                )}
              </div>
            )
          })}
        </Card>
      )}

      {activeTab === 'privacy' && (
        <Card className="p-6 space-y-4 text-xs text-text-muted leading-relaxed">
          <CardTitle className="text-base text-text">Privacy Policy</CardTitle>
          <p>
            Your financial privacy is our highest priority. Sanchay is designed to collect the minimum necessary data to provide offline-first personal financial management and cloud synchronization.
          </p>
          <h4 className="font-bold text-text text-sm pt-2">1. No Third-Party Trackers</h4>
          <p>
            We do not embed third-party advertising SDKs, behavioral analytics, or marketing trackers. Your transactions, notes, payees, and account balances remain strictly private.
          </p>
          <h4 className="font-bold text-text text-sm pt-2">2. Data Security & Storage</h4>
          <p>
            All network communication with our servers is encrypted using HTTPS / TLS. Row Level Security (RLS) is enforced in our database so that only your authenticated account can ever access your records.
          </p>
          <h4 className="font-bold text-text text-sm pt-2">3. Full Data Portability and Deletion</h4>
          <p>
            You can download all your data at any time via Settings. If you choose to delete your account, all your records and files are irreversibly deleted from our database.
          </p>
        </Card>
      )}

      {activeTab === 'terms' && (
        <Card className="p-6 space-y-4 text-xs text-text-muted leading-relaxed">
          <CardTitle className="text-base text-text">Terms of Service</CardTitle>
          <p>
            By using Sanchay, you agree to these standard terms. Sanchay is provided for personal budgeting and bookkeeping purposes.
          </p>
          <h4 className="font-bold text-text text-sm pt-2">1. Personal Use</h4>
          <p>
            Sanchay is a self-directed personal finance tool. It is not an automated tax advisor or certified financial planning authority. You remain responsible for verifying accuracy against official financial institution statements.
          </p>
          <h4 className="font-bold text-text text-sm pt-2">2. Service Availability</h4>
          <p>
            While Sanchay functions 100% offline, cloud sync availability depends on network connectivity and server maintenance.
          </p>
        </Card>
      )}

      {activeTab === 'about' && (
        <Card className="p-6 text-center space-y-3">
          <div className="flex justify-center mx-auto mb-2">
            <Logo size={56} className="shadow-md rounded-2xl" />
          </div>
          <h3 className="font-cinzel font-bold text-2xl text-text tracking-wider">Sanchay</h3>
          <p className="text-xs text-text-muted max-w-md mx-auto">
            An offline-first, open-standard personal finance PWA designed for lightning-fast money tracking, smart budget rollover, and clean privacy.
          </p>
          <div className="pt-4 text-[11px] text-text-muted border-t border-border/50">
            Version 1.0.0 • Built with React, TypeScript, Dexie & Supabase
          </div>
        </Card>
      )}
    </div>
  )
}
