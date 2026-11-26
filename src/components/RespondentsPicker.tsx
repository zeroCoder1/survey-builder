import type { Person, Respondents } from '../types';

/** Select for who takes a survey: everyone, people managers, or a role from the org directory. */
export default function RespondentsPicker({ value, org, onChange }: { value: Respondents; org: Person[]; onChange: (v: Respondents) => void }) {
  const roles = [...new Set(org.map((p) => p.role).filter(Boolean))].sort();
  if (value.startsWith('role:') && !roles.includes(value.slice(5))) roles.push(value.slice(5));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Respondents)} style={{ width: 'auto' }}>
      <option value="everyone">Everyone</option>
      <option value="managers">People managers (anyone with reports)</option>
      {roles.map((r) => (
        <option key={r} value={`role:${r}`}>Role: {r}</option>
      ))}
    </select>
  );
}
