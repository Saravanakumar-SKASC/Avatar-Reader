import PageHeader from '@/components/app/PageHeader';
import { CrownIcon } from '@/components/app/icons';

const FREE = ['Unlimited PDFs on this device', 'All 7 narrators', 'Expressions, lip-sync and word highlight', 'Local narration (Piper) always available'];
const PREMIUM = ['Cloud library synced across devices', 'Premium voices and exclusive avatars', 'Unlimited Fish Audio narration', 'Priority generation, offline packs'];

export default function SubscriptionsPage() {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto">
      <PageHeader title="Subscriptions" subtitle="Everything in the reader is free while we're in preview." />
      <div className="grid gap-6 px-6 pb-10 md:grid-cols-2 lg:px-10">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-200/60">Current plan</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Free</h2>
          <p className="text-sm text-violet-100/70">$0 · forever</p>
          <ul className="mt-5 flex flex-col gap-2 text-sm text-violet-100/85">
            {FREE.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-emerald-300">✓</span> {f}
              </li>
            ))}
          </ul>
        </section>
        <section className="relative overflow-hidden rounded-3xl border border-violet-400/30 bg-gradient-to-br from-violet-600/30 via-fuchsia-600/15 to-transparent p-6">
          <div className="absolute right-4 top-4 rounded-full bg-amber-300/20 px-3 py-1 text-xs font-semibold text-amber-200">Coming soon</div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-200/70">
            <CrownIcon className="text-amber-300" width={16} height={16} /> Premium
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Premium Subscription</h2>
          <p className="text-sm text-violet-100/70">Unlimited eBooks, exclusive avatars and more.</p>
          <ul className="mt-5 flex flex-col gap-2 text-sm text-violet-100/85">
            {PREMIUM.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-violet-300">★</span> {f}
              </li>
            ))}
          </ul>
          <button type="button" disabled className="mt-6 w-full cursor-not-allowed rounded-xl bg-white/20 px-4 py-3 text-sm font-semibold text-white/70">
            Join the waitlist (not yet available)
          </button>
          <p className="mt-2 text-center text-[11px] text-violet-200/50">No payment method required. Nothing is charged.</p>
        </section>
      </div>
    </main>
  );
}
