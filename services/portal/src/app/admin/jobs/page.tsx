// Legacy — Jobs renamed to Stations on 2026-04-13. `git rm -r src/app/admin/jobs src/app/api/jobs` locally.
import { redirect } from 'next/navigation';
export default function LegacyJobsRedirect() { redirect('/admin/stations'); }
