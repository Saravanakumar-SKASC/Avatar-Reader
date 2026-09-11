import type { ReactNode } from 'react';
import ProfileMenu from './ProfileMenu';

export default function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 px-6 pb-2 pl-14 pt-4 lg:px-10 lg:pl-14">
      <div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-violet-200/60">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <ProfileMenu />
      </div>
    </header>
  );
}
