import Icon from '../components/Icon';
import { useMemo, useState } from 'react';
import { childrenMap, DEFAULT_SAMPLE, emptyPerson, generateSampleOrg, ORG_COLUMNS, parsePastedOrg, roots } from '../org';
import type { Person, Study } from '../types';

interface Props {
  study: Study;
  setStudy: (s: Study) => void;
}

export default function PeopleTab({ study, setStudy }: Props) {
  const org = study.org ?? [];
  const setOrg = (o: Person[]) => setStudy({ ...study, org: o });
  const [view, setView] = useState<'tree' | 'table'>('tree');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'none' | 'generate' | 'paste'>(org.length ? 'none' : 'generate');

  const stats = useMemo(() => {
    const codes = org.map((p) => p.code);
    const codeSet = new Set(codes);
    const mgrs = new Set(org.map((p) => p.managerCode).filter((c) => codeSet.has(c)));
    return {
      managers: mgrs.size,
      ams: org.filter((p) => /account manager/i.test(p.role)).length,
      dupes: [...new Set(codes.filter((c, i) => c && codes.indexOf(c) !== i))],
      orphans: org.filter((p) => p.managerCode && !codeSet.has(p.managerCode)).length,
    };
  }, [org]);

  const update = (p: Person) => setOrg(org.map((x) => (x.id === p.id ? p : x)));
  const remove = (p: Person) => {
    const reports = org.filter((x) => x.managerCode === p.code).length;
    if (reports && !confirm(`${p.name || p.code} has ${reports} direct reports. They will move up to ${p.managerCode || 'the top level'}. Continue?`)) return;
    setOrg(org.filter((x) => x.id !== p.id).map((x) => (x.managerCode === p.code ? { ...x, managerCode: p.managerCode } : x)));
  };
  const addUnder = (manager?: Person) => {
    const max = org.reduce((m, p) => Math.max(m, Number(p.code.replace(/\D/g, '')) || 0), 0);
    const p = emptyPerson({
      code: `E${String(max + 1).padStart(4, '0')}`,
      managerCode: manager?.code ?? '',
      division: manager?.division ?? '',
    });
    setOrg([...org, p]);
    return p;
  };

  return (
    <div className="container">
      <div className="row between wrap gap">
        <div>
          <h2 style={{ margin: 0 }}>People</h2>
          <p className="muted small" style={{ margin: '4px 0 0', maxWidth: 560 }}>
            Optional. Add your org tree so simulated responses come from real people and reporting lines (e.g. each manager's team
            assessment lists their actual direct reports). Leave it empty to keep all data anonymous.
          </p>
        </div>
        <div className="row gap">
          <button className="btn small" onClick={() => setPanel(panel === 'paste' ? 'none' : 'paste')}>Paste from Excel</button>
          <button className="btn small" onClick={() => setPanel(panel === 'generate' ? 'none' : 'generate')}>Generate sample org</button>
          {org.length > 0 && (
            <button className="btn small ghost danger" onClick={() => confirm(`Remove all ${org.length} people? Simulated data will become anonymous again.`) && setOrg([])}>
              Clear
            </button>
          )}
        </div>
      </div>

      {panel === 'generate' && <GeneratePanel hasOrg={org.length > 0} onDone={(o) => (setOrg(o), setPanel('none'))} onCancel={() => setPanel('none')} />}
      {panel === 'paste' && <PastePanel onDone={(o, replace) => (setOrg(replace ? o : [...org, ...o]), setPanel('none'))} onCancel={() => setPanel('none')} />}

      {org.length > 0 && (
        <>
          <div className="stats">
            <span><b>{org.length}</b> people</span>
            <span><b>{stats.managers}</b> people managers</span>
            <span><b>{stats.ams}</b> account managers</span>
            {stats.dupes.length > 0 && <span className="error">Duplicate codes: {stats.dupes.slice(0, 5).join(', ')}</span>}
            {stats.orphans > 0 && <span className="error">{stats.orphans} with an unknown manager code</span>}
          </div>
          <div className="row gap center" style={{ marginBottom: 10 }}>
            <input placeholder="Search name, code, division, role…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
            <div className="seg">
              <button className={view === 'tree' ? 'on' : ''} onClick={() => setView('tree')}>Tree</button>
              <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
            </div>
            <div className="spacer" />
            <button className="btn small" onClick={() => addUnder()}><Icon name="plus" size={14} /> Add person</button>
          </div>
          {view === 'tree' ? (
            <OrgTree org={org} query={query} onUpdate={update} onRemove={remove} onAdd={addUnder} />
          ) : (
            <OrgTable org={org} query={query} onUpdate={update} onRemove={remove} />
          )}
        </>
      )}
    </div>
  );
}

const matches = (p: Person, q: string) =>
  !q || [p.name, p.code, p.division, p.role, p.category, p.band].some((v) => v.toLowerCase().includes(q.toLowerCase()));

function OrgTree({ org, query, onUpdate, onRemove, onAdd }: { org: Person[]; query: string; onUpdate: (p: Person) => void; onRemove: (p: Person) => void; onAdd: (m: Person) => Person }) {
  const kids = useMemo(() => childrenMap(org), [org]);
  const managerCodes = useMemo(() => org.filter((p) => kids.get(p.code)?.length).map((p) => p.code), [org, kids]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(roots(org).map((p) => p.code)));
  const [editing, setEditing] = useState<string | null>(null);

  // when searching, show matches plus their ancestors, fully expanded
  const visible = useMemo(() => {
    if (!query) return null;
    const byCode = new Map(org.map((p) => [p.code, p]));
    const keep = new Set<string>();
    for (const p of org)
      if (matches(p, query)) {
        let cur: Person | undefined = p;
        while (cur && !keep.has(cur.code)) {
          keep.add(cur.code);
          cur = byCode.get(cur.managerCode);
        }
      }
    return keep;
  }, [org, query]);

  const toggle = (code: string) => {
    const n = new Set(open);
    n.has(code) ? n.delete(code) : n.add(code);
    setOpen(n);
  };
  const allOpen = managerCodes.every((c) => open.has(c));

  const render = (p: Person, depth: number, seen: Set<string>): JSX.Element | null => {
    if (visible && !visible.has(p.code)) return null;
    if (seen.has(p.code)) return null; // guard against reporting-line cycles
    const nextSeen = new Set(seen).add(p.code);
    const reports = kids.get(p.code) ?? [];
    const hasReports = reports.length > 0;
    const isOpen = hasReports && (visible ? true : open.has(p.code));
    const label = `${isOpen ? 'Hide' : 'Show'} ${reports.length} direct report${reports.length === 1 ? '' : 's'} of ${p.name || p.code}`;
    return (
      <div key={p.id} className="org-branch" role="treeitem" aria-expanded={hasReports ? isOpen : undefined} aria-level={depth + 1}>
        <div
          className={`org-node ${hasReports ? 'has-reports' : ''} ${isOpen ? 'is-open' : ''} ${visible && matches(p, query) ? 'hit' : ''} ${editing === p.id ? 'editing' : ''}`}
          onClick={() => hasReports && !visible && toggle(p.code)}
        >
          {hasReports ? (
            <button
              className="org-toggle"
              aria-label={label}
              title={label}
              onClick={(e) => {
                e.stopPropagation();
                if (!visible) toggle(p.code);
              }}
            >
              <Icon name="chevronRight" size={14} className="chev" />
            </button>
          ) : (
            <span className="org-toggle-spacer" aria-hidden="true" />
          )}
          <span className="avatar">{initials(p.name)}</span>
          <span className="org-ident">
            <span className="org-name">{p.name || <em className="muted">No name</em>}</span>
            <span className="org-meta">
              <span className="mono">{p.code}</span>
              {[p.role, p.division, p.band].filter(Boolean).map((v) => (
                <span key={v}>{v}</span>
              ))}
            </span>
          </span>
          {hasReports && (
            <span className="org-count" title={`${reports.length} direct reports`}>
              <Icon name="users" size={12} /> {reports.length}
            </span>
          )}
          <span className="org-actions" onClick={(e) => e.stopPropagation()}>
            <button className="icon tiny" title="Edit" aria-label={`Edit ${p.name}`} onClick={() => setEditing(editing === p.id ? null : p.id)}>
              <Icon name="pencil" size={14} />
            </button>
            <button
              className="icon tiny"
              title="Add direct report"
              aria-label={`Add direct report to ${p.name}`}
              onClick={() => {
                const np = onAdd(p);
                setOpen(new Set(open).add(p.code));
                setEditing(np.id);
              }}
            >
              <Icon name="plus" size={14} />
            </button>
            <button className="icon tiny danger" title="Remove" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p)}>
              <Icon name="x" size={14} />
            </button>
          </span>
        </div>
        {editing === p.id && <PersonForm person={p} org={org} onChange={onUpdate} onClose={() => setEditing(null)} indent={34} />}
        {isOpen && (
          <div className="org-children" role="group">
            {reports.map((r) => render(r, depth + 1, nextSeen))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card org-tree">
      <div className="org-tree-head">
        <span className="muted small">{query ? 'Showing matches and their managers' : `${managerCodes.length} teams`}</span>
        <div className="spacer" />
        {!query && (
          <button
            className="btn small ghost"
            onClick={() => setOpen(allOpen ? new Set(roots(org).map((p) => p.code)) : new Set(managerCodes))}
          >
            <Icon name={allOpen ? 'collapseAll' : 'expandAll'} size={14} /> {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>
      <div className="org-tree-body" role="tree">
        {roots(org).map((p) => render(p, 0, new Set()))}
      </div>
    </div>
  );
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

function PersonForm({ person, org, onChange, onClose, indent }: { person: Person; org: Person[]; onChange: (p: Person) => void; onClose: () => void; indent: number }) {
  return (
    <div className="person-form" style={{ marginLeft: indent }}>
      <div className="grid-4">
        {ORG_COLUMNS.map(([k, label]) => (
          <label key={k} className="field">
            <span>{label}</span>
            {k === 'managerCode' ? (
              <select value={person.managerCode} onChange={(e) => onChange({ ...person, managerCode: e.target.value })}>
                <option value="">(top level)</option>
                {org
                  .filter((o) => o.id !== person.id)
                  .map((o) => (
                    <option key={o.id} value={o.code}>{o.code} — {o.name}</option>
                  ))}
              </select>
            ) : (
              <input value={person[k]} onChange={(e) => onChange({ ...person, [k]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <button className="btn small" onClick={onClose}>Done</button>
    </div>
  );
}

function OrgTable({ org, query, onUpdate, onRemove }: { org: Person[]; query: string; onUpdate: (p: Person) => void; onRemove: (p: Person) => void }) {
  const [limit, setLimit] = useState(100);
  const rows = org.filter((p) => matches(p, query));
  return (
    <div className="table-wrap">
      <table className="sheet edit">
        <thead>
          <tr>
            {ORG_COLUMNS.map(([, l]) => (
              <th key={l}>{l}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((p) => (
            <tr key={p.id}>
              {ORG_COLUMNS.map(([k]) => (
                <td key={k}>
                  <input value={p[k]} onChange={(e) => onUpdate({ ...p, [k]: e.target.value })} />
                </td>
              ))}
              <td>
                <button className="icon tiny danger" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p)}><Icon name="x" size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <button className="btn small dashed" onClick={() => setLimit(limit + 200)}>
          Show more ({rows.length - limit} hidden)
        </button>
      )}
    </div>
  );
}

function GeneratePanel({ hasOrg, onDone, onCancel }: { hasOrg: boolean; onDone: (o: Person[]) => void; onCancel: () => void }) {
  const [o, setO] = useState(DEFAULT_SAMPLE);
  return (
    <div className="card panel">
      <b>Generate a sample org</b>
      <p className="muted small">Creates a CEO, one head per division, people managers and their teams, with made-up names.</p>
      <div className="row gap wrap">
        <label className="field"><span>People</span><input type="number" className="num" value={o.employees} min={10} onChange={(e) => setO({ ...o, employees: Number(e.target.value) })} /></label>
        <label className="field"><span>Avg. team size</span><input type="number" className="num" value={o.span} min={2} onChange={(e) => setO({ ...o, span: Number(e.target.value) })} /></label>
        <label className="field"><span>Account managers</span><input type="number" className="num" value={o.accountManagers} min={0} onChange={(e) => setO({ ...o, accountManagers: Number(e.target.value) })} /></label>
        <label className="field" style={{ flex: 1, minWidth: 260 }}>
          <span>Divisions (comma separated)</span>
          <input value={o.divisions.join(', ')} onChange={(e) => setO({ ...o, divisions: e.target.value.split(',').map((d) => d.trim()).filter(Boolean) })} />
        </label>
      </div>
      <div className="row gap">
        <button className="btn primary small" onClick={() => (!hasOrg || confirm('Replace the current org directory?')) && onDone(generateSampleOrg(o))}>
          Generate
        </button>
        <button className="btn small ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PastePanel({ onDone, onCancel }: { onDone: (o: Person[], replace: boolean) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parsePastedOrg(text), [text]);
  return (
    <div className="card panel">
      <b>Paste from Excel</b>
      <p className="muted small">
        Copy rows from a spreadsheet and paste below. Columns: {ORG_COLUMNS.map(([, l]) => l).join(', ')}. A header row is optional.
      </p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'E0001\tAiko Tanaka\t\tCorporate / support\tBand 5\tManagement\tCEO\nE0002\tArjun Sharma\tE0001\tDivision 1\tBand 5\tManagement\tDivision head'} />
      <div className="row gap center" style={{ marginTop: 8 }}>
        <span className="muted small">{parsed.length} people detected</span>
        <div className="spacer" />
        <button className="btn small" disabled={!parsed.length} onClick={() => onDone(parsed, false)}>Add to directory</button>
        <button className="btn primary small" disabled={!parsed.length} onClick={() => onDone(parsed, true)}>Replace directory</button>
        <button className="btn small ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
